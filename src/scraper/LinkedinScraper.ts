import deepmerge from 'deepmerge';
import { config } from '../config';
import puppeteer from 'puppeteer';
import { Browser, BrowserContext, HTTPRequest } from 'puppeteer';
import { events } from './events';
import { states } from './states';
import { browserDefaults, queryOptionsDefault } from './defaults';
import { sleep } from '../utils/utils';
import { getQueryParams } from '../utils/url';
import { urls } from './constants';
import { IQuery, IQueryOptions, QuerySchema } from './query';
import { getRandomUserAgent } from '../utils/browser';
import { Scraper, ScraperOptions } from './Scraper';
import { RunStrategy, AuthenticatedStrategy } from './strategies';
import { logger } from '../logger/logger';
import { JobStorage } from '../utils/JobStore';

// puppeteer.use(require('puppeteer-extra-plugin-stealth')()); // TODO: breaks with new target tabs: to investigate

/**
 * Main class
 * @extends EventEmitter
 * @param options {ScraperOptions} Puppeteer browser options, for more informations see
 * https://pptr.dev/#?product=Puppeteer&version=v2.0.0&show=api-puppeteerlaunchoptions
 * @constructor
 */
class LinkedinScraper extends Scraper {
  private _runStrategy: RunStrategy;
  private _browser: Browser | undefined;
  private _context!: BrowserContext;
  private _state = states.notInitialized;
  public jobStorage?: JobStorage;
  /**
   * @constructor
   * @param {ScraperOptions} options
   */
  constructor(options: ScraperOptions) {
    super(options);
    this.jobStorage = options.jobStorage;

    if (config.LI_AT_COOKIE || this.isExistingBrower) {
      this._runStrategy = new AuthenticatedStrategy(this);
      logger.info(`Env variable LI_AT_COOKIE detected. Using ${AuthenticatedStrategy.name}`);
    } else {
      throw new Error('AnonymousStrategy Removed');
      // this._runStrategy = new AnonymousStrategy(this);
      // logger.info(`Using ${AnonymousStrategy.name}`);
    }
  }


  public get isExistingBrower(): boolean {
    return !!(this.options.browserURL || this.options.browserWSEndpoint);
  }

  /**
   * Initialize browser
   * @private
   */
  private async _initialize() {
    this._state = states.initializing;
    if (this._browser) {
        this._browser.removeAllListeners();
        this._browser = undefined;
    }
    const launchOptions = deepmerge.all<ScraperOptions>([browserDefaults, this.options]);
    logger.info('Setting chrome launch options', launchOptions);
    if (this.isExistingBrower) {
      this._browser = await puppeteer.connect(launchOptions);
    } else {
      this._browser = await puppeteer.launch(launchOptions);
    }
    // Close initial browser page
    // await (await this._browser.pages())[0].close();
    if (this.isExistingBrower)
      this._context = this._browser.defaultBrowserContext();
    else
      this._context = await this._browser.createIncognitoBrowserContext();

    this._browser.on(events.puppeteer.browser.disconnected, () => {
      this.emit(events.puppeteer.browser.disconnected);
    });
    this._browser.on(events.puppeteer.browser.targetcreated, () => {
      this.emit(events.puppeteer.browser.targetcreated);
    });
    this._browser.on(events.puppeteer.browser.targetchanged, () => {
      this.emit(events.puppeteer.browser.targetchanged);
    });
    this._browser.on(events.puppeteer.browser.targetdestroyed, () => {
      this.emit(events.puppeteer.browser.targetdestroyed);
    });
    this._state = states.initialized;
  }

  /**
   * Build jobs search url
   * @param {string} query
   * @param {string} location
   * @param {IQueryOptions} options
   * @returns {string}
   * @private
   */
  private _buildSearchUrl = (query: string, location: string, options: IQueryOptions = {}): string => {
    const url = new URL(urls.jobsSearch);
    const { searchParams } = url;
    if (query) {
      searchParams.append('keywords', query);
    }
    if (location) {
      searchParams.append('location', location);
    }
    const { filters } = options;
    if (filters) {
      const { companyJobsUrl, relevance, time, type, experience, onSiteOrRemote } = filters;
      if (companyJobsUrl) {
        const queryParams = getQueryParams(companyJobsUrl);
        searchParams.append('f_C', queryParams['f_C']);
      }
      if (relevance) {
        searchParams.append('sortBy', relevance);
      }
      if (time) {
        url.searchParams.append('f_TPR', time);
      }
      if (type) {
        const queryParams = typeof type === 'string' ? type : type.join(',');
        searchParams.append('f_JT', queryParams);
      }
      if (experience) {
        const queryParams = typeof experience === 'string' ? experience : experience.join(',');
        searchParams.append('f_E', queryParams);
      }
      if (onSiteOrRemote) {
        const queryParams = typeof onSiteOrRemote === 'string' ? onSiteOrRemote : onSiteOrRemote.join(',');
        searchParams.append('f_WT', queryParams);
      }
    }
    searchParams.append('start', '0');
    return url.href;
  };

  /**
   * Scrape linkedin jobs
   * @param {IQuery | IQuery[]} queries
   * @param {IQueryOptions} [options]
   * @return {Promise<void>}
   * @private
   */
  private _run = async (queries: IQuery | IQuery[], options?: IQueryOptions): Promise<void> => {
    let tag: string;

    if (!Array.isArray(queries)) {
      queries = [queries];
    }

    // Merge options and validate
    for (const query of queries) {
      const optionsToMerge = [queryOptionsDefault];
      options && optionsToMerge.push(options);
      query.options && optionsToMerge.push(query.options);
      query.options = deepmerge.all(optionsToMerge, {
        arrayMerge: (destinationArray, sourceArray) => sourceArray,
      });

      // Add default location if none provided
      if (!query?.options?.locations?.length) {
        query.options.locations = ['Worldwide'];
      }
      //query = 
      QuerySchema.parse(query);
    }

    // Initialize browser
    if (!this._browser) {
      await this._initialize();
    }
    const _browser = this._browser;
    if (!_browser) throw new Error('Assertion failed: _browser');

    const wsEndpoint = _browser.wsEndpoint();

    if (wsEndpoint) {
      logger.info('Websocket debugger url:', wsEndpoint);
    }

    // Queries loop
    for (const query of queries) {
      const options = query.options || {};
      if (options.optimize) {
        logger.warn('Query option optimize=true: this could cause issues in jobs loading or pagination');
      }

      // Locations loop
      for (const location of options.locations || []) {
        tag = `[${query.query}][${location}]`;
        logger.info(tag, `Starting new query:`, `query="${query.query}"`, `location="${location}"`);
        logger.info(tag, `Query options`, query.options);

        // Open new page in incognito context
        const page = await this._context.newPage();

        // Create Chrome Developer Tools session
        const cdpSession = await page.target().createCDPSession();

        // Disable Content Security Policy: needed for pagination to work properly in anonymous mode
        await page.setBypassCSP(true);

        // Tricks to speed up page
        await cdpSession.send('Page.enable');
        await cdpSession.send('Page.setWebLifecycleState', {
          state: 'active',
        });

        // Set a random user agent
        if (!this.isExistingBrower)
          await page.setUserAgent(getRandomUserAgent());

        // Enable request interception
        await page.setRequestInterception(true);

        const onRequest = async (request: HTTPRequest) => {
          const url = new URL(request.url());
          const domain = url.hostname.split('.').slice(-2).join('.').toLowerCase();

          // Block tracking and other stuff not useful
          const toBlock = [
            'li/track',
            'realtime.www.linkedin.com/realtime',
            'platform.linkedin.com/litms',
            'linkedin.com/sensorCollect',
            'linkedin.com/pixel/tracking',
          ];

          if (toBlock.some((e) => url.pathname.includes(e))) {
            return request.abort();
          }

          // Block 3rd part domains requests
          if (!['linkedin.com', 'licdn.com'].includes(domain)) {
            return request.abort();
          }

          // If optimization is enabled, block other resource types
          if (options.optimize) {
            const resourcesToBlock = ['image', 'stylesheet', 'media', 'font', 'imageset'];

            if (
              resourcesToBlock.some((r) => request.resourceType() === r) ||
              request.url().includes('.jpg') ||
              request.url().includes('.jpeg') ||
              request.url().includes('.png') ||
              request.url().includes('.gif') ||
              request.url().includes('.css')
            ) {
              return request.abort();
            }
          }

          await request.continue();
        };

        // Add listener
        page.on('request', onRequest);

        // Error response and rate limiting check
        page.on('response', (response) => {
          if (response.status() === 429) {
            logger.warn(
              tag,
              "Error 429 too many requests. You would probably need to use a higher 'slowMo' value and/or reduce the number of concurrent queries.",
            );
          } else if (response.status() >= 400) {
            logger.warn(tag, response.status(), `Error for request ${response.request().url()}`);
          }
        });

        // Build search url
        const searchUrl = this._buildSearchUrl(query.query || '', location, query.options);

        // Run strategy
        const runStrategyResult = await this._runStrategy.run(this._context, page, cdpSession, searchUrl, query, location);

        // Check if forced exit is required
        if (runStrategyResult.exit) {
          logger.warn(tag, 'Forced termination');
          return;
        }

        // Close page
        page && (await page.close());
      }
    }

    // Emit end event
    this.emit(events.scraper.end);
  };

  /**
   * Scrape linkedin jobs
   * @param {IQuery | IQuery[]} queries
   * @param {IQueryOptions} [options]
   * @return {Promise<void>}
   */
  public run = async (queries: IQuery | IQuery[], options?: IQueryOptions): Promise<void> => {
    try {
      if (this._state === states.notInitialized) {
        await this._initialize();
      } else if (this._state === states.initializing) {
        const timeout = 10000;
        const pollingTime = 100;
        let elapsed = 0;

        while (this._state !== states.initialized) {
          await sleep(pollingTime);
          elapsed += pollingTime;

          if (elapsed >= timeout) {
            throw new Error(`Initialize timeout exceeded: ${timeout}ms`);
          }
        }
      }

      await this._run(queries, options);
    } catch (err) {
      // logger.error(err);
      this.emit(events.scraper.error, err as Error);
      await this.close();
      throw err;
    }
  };

  /**
   * Close browser instance
   * @returns {Promise<void>}
   */
  public close = async (): Promise<void> => {
    try {
      if (this._browser) {
        if (this._browser.removeAllListeners() && !this.isExistingBrower) {
            await this._browser.close()
        }
      }
    } finally {
      this._browser = undefined;
      this._state = states.notInitialized;
    }
  };
}

export { LinkedinScraper };
