import { config } from "../../config";
import { RunStrategy, IRunStrategyResult, ILoadResult } from "./RunStrategy";
import { BrowserContext, Page, CDPSession } from "puppeteer";
import { events, IData, IMetrics } from "../events";
import { convertToDateString, sleep } from "../../utils/utils";
import { normalizeString } from "../../utils/string";
import { IQuery } from "../query";
import { logger } from "../../logger/logger";
import { urls } from "../constants";

export const selectors = {
    container: '.jobs-search-results-list',
    chatPanel: '.msg-overlay-list-bubble',
    jobs: 'div.job-card-container',
    link: 'a.job-card-container__link',
    applyBtn: 'button.jobs-apply-button[role="link"]',
    title: '.artdeco-entity-lockup__title',
    company: ['.job-card-container__company-name', '.job-card-container__primary-description'],
    place: '.artdeco-entity-lockup__caption',
    date: 'time',
    dateAgo: '.jobs-unified-top-card__posted-date',
    description: '.jobs-description',
    detailsPanel: '.jobs-search__job-details--container',
    detailsTop: '.jobs-details-top-card',
    details: '.jobs-details__main-content',
    insights: '[class=jobs-unified-top-card__job-insight]', // only one class
    pagination: '.jobs-search-two-pane__pagination',
    privacyAcceptBtn: 'button.artdeco-global-alert__action',
    paginationNextBtn: 'li[data-test-pagination-page-btn].selected + li',
    paginationBtn: (index: number) => `li[data-test-pagination-page-btn="${index}"] button`,
};

/**
 * @class AuthenticatedStrategy
 * @extends RunStrategy
 */
export class AuthenticatedStrategy extends RunStrategy {
    /**
     * Check if session is authenticated
     * @param {Page} page
     * @returns {Promise<boolean>}
     * @returns {Promise<ILoadResult>}
     * @static
     * @private
     */
    private static _isAuthenticatedSession = async (page: Page): Promise<boolean> => {
        const cookies = await page.cookies();
        return cookies.some(e => e.name === "li_at");
    };

    /**
     * Load jobs
     * @param page {Page}
     * @param jobsTot {number}
     * @param timeout {number}
     * @static
     * @private
     */
    private static _loadJobs = async (
        page: Page,
        jobsTot: number,
        timeout: number = 2000,
    ): Promise<any> => {
        const pollingTime = 50;
        let elapsed = 0;

        await sleep(pollingTime);

        try {
            while (elapsed < timeout) {
                const jobsCount = await page.evaluate((selector) => {
                    return document.querySelectorAll(selector).length;
                }, selectors.jobs);

                if (jobsCount > jobsTot) {
                    return { success: true, count: jobsCount };
                }

                await sleep(pollingTime);
                elapsed += pollingTime;
            }
        }
        catch (err) {}

        return {
            success: false,
            error: `Timeout on loading jobs`
        };
    };

    /**
     * Try to load job details
     * @param {Page} page
     * @param {string} jobId
     * @param {number} timeout
     * @static
     * @private
     */
    private static _loadJobDetails = async (
        page: Page,
        jobId: string,
        timeout: number = 2000,
    ): Promise<ILoadResult> => {
        const pollingTime = 50;
        let elapsed = 0;
        let loaded = false;
        await sleep(pollingTime);
        try {
            while (elapsed < timeout) {
                loaded = await page.evaluate(
                    (jobId, panelSelector, descriptionSelector) => {
                        const detailsPanel = document.querySelector(panelSelector) as HTMLElement;
                        if (!detailsPanel) return false;
                        const description = document.querySelector(descriptionSelector) as HTMLElement;
                        if (!description) return false;
                        return !!(detailsPanel.innerHTML.includes(jobId) && description.innerText);
                    },
                    jobId,
                    selectors.detailsPanel,
                    selectors.description,
                );
                if (loaded) return { success: true };
                await sleep(pollingTime);
                elapsed += pollingTime;
            }
        }
        catch (_err) {}

        return {
            success: false,
            error: `Timeout on loading job details`
        };
    };

    /**
     * Try to paginate
     * @param {Page} page
     * @param {string} tag
     * @param {string} paginationSize
     * @param {number} timeout
     * @returns {Promise<ILoadResult>}
     * @static
     * @private
     */
    private static _paginate = async (
        page: Page,
        tag: string,
        paginationSize: number = 25,
        timeout: number = 2000,
    ): Promise<ILoadResult> => {
        const url = new URL(page.url());

        // Extract offset from url
        let offset = parseInt(url.searchParams.get('start') || "0", 10);
        offset += paginationSize;

        // Update offset in url
        url.searchParams.set('start', '' + offset);

        logger.info(tag, 'Next offset: ', offset);
        logger.info(tag, 'Opening', url.toString());

        // Navigate new url
        await page.goto(url.toString(), {
            waitUntil: 'load',
        });

        const pollingTime = 100;
        let elapsed = 0;
        let loaded = false;

        logger.info(tag, 'Waiting for new jobs to load');

        // Wait for new jobs to load
        while (!loaded) {
            loaded = await page.evaluate(
                (selector) => {
                    return document.querySelectorAll(selector).length > 0;
                },
                selectors.jobs,
            );

            if (loaded) return { success: true };

            await sleep(pollingTime);
            elapsed += pollingTime;

            if (elapsed >= timeout) {
                return {
                    success: false,
                    error: `Timeout on pagination`
                };
            }
        }

        return { success: true };
    };

    /**
     * Hide chat panel
     * @param {Page} page
     * @param {string} tag
     */
    private static _hideChatPanel = async (
        page: Page,
        tag: string,
    ): Promise<void> => {
        try {
            await page.evaluate((selector) => {
                    const div = document.querySelector(selector) as HTMLElement;
                    if (div) {
                        div.style.display = "none";
                    }
                },
                selectors.chatPanel);
        }
        catch (err) {
            logger.debug(tag, "Failed to hide chat panel");
        }
    };

    /**
     * Accept cookies
     * @param {Page} page
     * @param {string} tag
     */
    private static _acceptCookies = async (
        page: Page,
        tag: string,
    ): Promise<void> => {
        try {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const cookieButton = buttons.find(e => e.innerText.includes('Accept cookies'));

                if (cookieButton) {
                    cookieButton.click();
                }
            });
        }
        catch (err) {
            logger.debug(tag, "Failed to accept cookies");
        }
    };

    /**
     * Accept privacy
     * @param page
     * @param tag
     */
    private static _acceptPrivacy = async (
        page: Page,
        tag: string,
    ): Promise<void> => {
        try {
            await page.evaluate((selector) => {
                const privacyButton = Array.from(document.querySelectorAll<HTMLElement>(selector))
                    .find(e => e.innerText === 'Accept');

                if (privacyButton) {
                    privacyButton.click();
                }
            }, selectors.privacyAcceptBtn);
        }
        catch (err) {
            logger.debug(tag, "Failed to accept privacy");
        }
    };

    /**
     * Try extracting apply link
     * @param {Page} page
     * @param {CDPSession} cdpSession
     * @param {string} tag
     * @param {number} timeout
     * @returns {Promise<{ success: boolean, url?: string, error?: string | Error }>}
     */
    private static _extractApplyLink = async (
        page: Page,
        cdpSession: CDPSession,
        tag: string,
        timeout = 4,
    ): Promise<{ success: boolean, url?: string, error?: string | Error }> => {
        try {
            logger.debug(tag, 'Try extracting apply link');
            const currentUrl = page.url();
            const elapsed = 0;
            const sleepTimeMs = 100;

            if (await page.evaluate((applyBtnSelector: string) => {
                const applyBtn = document.querySelector(applyBtnSelector) as HTMLButtonElement;

                if (applyBtn) {
                    applyBtn.click();
                    return true;
                }

                return false;
            }, selectors.applyBtn)) {

                while (elapsed < timeout) {
                    const targetsResponse = await cdpSession.send('Target.getTargets');

                    // The first target of type page with a valid url different from main page should be our guy
                    if (targetsResponse.targetInfos && targetsResponse.targetInfos.length > 1) {
                        for (const targetInfo of targetsResponse.targetInfos) {
                            if (targetInfo.attached && targetInfo.type === 'page' && targetInfo.url && targetInfo.url !== currentUrl) {
                                await cdpSession.send('Target.closeTarget', { targetId: targetInfo.targetId });
                                return { success: true, url: targetInfo.url };
                            }
                        }
                    }

                    await sleep(sleepTimeMs);
                }

                return { success: false, error: 'timeout' };
            }
            else {
                return { success: false, error: 'apply button not found' };
            }
        }
        catch (err: any) {
            logger.warn(tag, 'Failed to extract apply link', err);
            return { success: false, error: err };
        }
    };

    /**
     * Run strategy
     * @param browser
     * @param page
     * @param cdpSession
     * @param url
     * @param query
     * @param location
     */
    public run = async (
        browser: BrowserContext,
        page: Page,
        cdpSession: CDPSession,
        url: string,
        query: IQuery,
        location: string,
    ): Promise<IRunStrategyResult> => {
        const options = query.options || {};
        let tag = `[${query.query}][${location}]`;

        const metrics: IMetrics = { processed: 0, failed: 0, missed: 0, skipped: 0};

        let paginationIndex = options.pageOffset || 0;
        let paginationSize = 25;

        // Navigate to home page
        logger.debug(tag, "Opening", urls.home);

        await page.goto(urls.home, {waitUntil: 'load'});

        // Set cookie
        logger.info("Setting authentication cookie");
        await page.setCookie({
            name: "li_at",
            value: config.LI_AT_COOKIE!,
            domain: ".www.linkedin.com"
        });

        // Override start by the page offset
        const _url = new URL(url);
        _url.searchParams.set('start', `${paginationIndex * paginationSize}`);
        url = _url.href;

        // Open search url
        logger.info(tag, "Opening", url);

        await page.goto(url, {waitUntil: 'load'});

        // Verify session
        if (!(await AuthenticatedStrategy._isAuthenticatedSession(page))) {
            logger.error("The provided session cookie is invalid. Check the documentation on how to obtain a valid session cookie.");
            this.scraper.emit(events.scraper.invalidSession);
            return { exit: true };
        }

        try {
            await page.waitForSelector(selectors.container, { timeout: 5000 });
        }
        catch(_err: unknown) {
            logger.info(tag, `No jobs found, skip`);
            return { exit: false };
        }

        // Pagination loop
        while (metrics.processed < options.limit!) {
            // Verify session in the loop
            if (!(await AuthenticatedStrategy._isAuthenticatedSession(page))) {
                logger.warn(tag, "Session is invalid, this may cause the scraper to fail.");
                this.scraper.emit(events.scraper.invalidSession);
            }
            else {
                logger.info(tag, "Session is valid");
            }

            await AuthenticatedStrategy._hideChatPanel(page, tag);
            await AuthenticatedStrategy._acceptCookies(page, tag);
            await AuthenticatedStrategy._acceptPrivacy(page, tag);

            let jobIndex = 0;

            // Get number of all job links in the page
            let jobsTot = await page.evaluate(
                (selector) => document.querySelectorAll(selector).length,
                selectors.jobs
            );

            if (jobsTot === 0) {
                logger.info(tag, `No jobs found, skip`);
                break;
            }

            // Jobs loop
            while (jobIndex < jobsTot && metrics.processed < options.limit!) {
                tag = `[${query.query}][${location}][${paginationIndex * paginationSize + jobIndex + 1}]`;

                const data: IData = {
                    query: query.query || '',
                    location,
                    jobId: '',
                    jobIndex,
                    link: '',
                    title: '',
                    company: '',
                    place: '',
                    date: '',
                    description: '',
                    descriptionHTML: '',
                    insights: [],
                }

                try {
                    // Extract job main fields
                    {
                        const {jobs, link, title, company, place, date} = selectors;
                        logger.debug(tag, 'Evaluating selectors', [ jobs, link, title, company, place, date ]);
                    }
                    const jobFieldsResult = await page.evaluate(
                        (
                            jobsSelector: string,
                            linkSelector: string,
                            titleSelector: string,
                            companySelectors: string[],
                            placeSelector: string,
                            dateSelector: string,
                            jobIndex: number
                        ) => {
                            const job = document.querySelectorAll(jobsSelector)[jobIndex];
                            const link = job.querySelector(linkSelector) as HTMLElement;

                            // Click job link and scroll
                            link.scrollIntoView();
                            link.click();

                            // Extract job link (relative)
                            const protocol = window.location.protocol + "//";
                            const hostname = window.location.hostname;
                            const jobLink = protocol + hostname + link.getAttribute("href");

                            const jobId = job.getAttribute("data-job-id");
                            const titleSelected = job.querySelector(titleSelector) as HTMLElement;

                            const title = titleSelected ? titleSelected.innerText : "";

                            let company = "";
                            let companyLink = undefined;

                            for (const companySelector of companySelectors) {
                                const companyElem = job.querySelector<HTMLElement>(companySelector);
                                if (companyElem) {
                                    company = companyElem.innerText;
                                    const href = companyElem.getAttribute("href");
                                    companyLink = href ? `${protocol}${hostname}${href}` : undefined;
                                }
                            }

                            const companyImgLink = (<HTMLElement>job.querySelector("img"))?.getAttribute("src") ?? undefined;

                            const placeSelected = job.querySelector(placeSelector) as HTMLElement;
                            const place = placeSelected ? placeSelected.innerText : "";

                            const dateSelected = job.querySelector(dateSelector) as HTMLElement;
                            const date = dateSelected ? dateSelected.getAttribute('datetime') : "";
                            const isPromoted = !!(Array.from(job.querySelectorAll('li'))
                                .find(e => e.innerText === 'Promoted'));

                            return { jobId, jobLink, title, company, companyLink, companyImgLink, place, date, isPromoted };
                        },
                        selectors.jobs,
                        selectors.link,
                        selectors.title,
                        selectors.company,
                        selectors.place,
                        selectors.date,
                        jobIndex
                    );
                    data.jobId = jobFieldsResult.jobId || '';
                    data.link = jobFieldsResult.jobLink;
                    data.title = jobFieldsResult.title;
                    data.company = jobFieldsResult.company;
                    data.companyLink = jobFieldsResult.companyLink;
                    data.companyImgLink = jobFieldsResult.companyImgLink;
                    data.place = jobFieldsResult.place;
                    data.date = jobFieldsResult.date || '';
                    let jobIsPromoted = jobFieldsResult.isPromoted;

                    // Promoted job
                    if (options.skipPromotedJobs && jobIsPromoted) {
                        logger.info(tag, 'Skipped because promoted');
                        metrics.skipped += 1;
                        jobIndex += 1;

                        if (metrics.processed < options.limit! && jobIndex === jobsTot && jobsTot < paginationSize) {
                            const loadJobsResult = await AuthenticatedStrategy._loadJobs(page, jobsTot);

                            if (loadJobsResult.success) {
                                jobsTot = loadJobsResult.count;
                            }
                        }

                        if (jobIndex === jobsTot) {
                            break;
                        }
                        else {
                            continue;
                        }
                    }

                    // Try to load job details and extract job link
                    logger.debug(tag, 'Evaluating selectors', [selectors.jobs]);

                    const loadDetailsResult = await AuthenticatedStrategy._loadJobDetails(page, data.jobId!);

                    // Check if loading job details has failed
                    if (!loadDetailsResult.success) {
                        logger.error(tag, loadDetailsResult.error);
                        jobIndex += 1;
                        continue;
                    }

                    // Use custom description function if available
                    logger.debug(tag, 'Evaluating selectors', [ selectors.description ]);

                    if (options.descriptionFn) {
                        const jobDescription = page.evaluate(`(${options.descriptionFn.toString()})();`);
                        const jobDescriptionHTML = page.evaluate((selector) => (document.querySelector(selector)!).outerHTML, selectors.description);
                        data.description = (await jobDescription) as string;
                        data.descriptionHTML = await jobDescriptionHTML;
                    } else {
                        const [jobDescription, jobDescriptionHTML] = await page.evaluate((selector) => {
                                const el = document.querySelector(selector) as HTMLElement;
                                return [el.innerText, el.outerHTML];
                            },
                            selectors.description
                        );
                        data.description = jobDescription;
                        data.descriptionHTML = jobDescriptionHTML;
                    }

                    // LinkedIn sometimes returns a job without a date on the side panel
                    if (!data.date) {
                        const agoText = await page.evaluate((selector) => {
                            const el = document.querySelector(selector) as HTMLElement;
                            return (el.innerText || '').trim();
                        }, selectors.dateAgo);
                        if (agoText) {
                            try {
                                data.date = convertToDateString(agoText);
                            } catch (err) {
                                logger.warn(tag, `Failed to parse secondary date: ${agoText}`, err);
                            }
                        }
                    }
 
                    // Extract job insights
                    logger.debug(tag, 'Evaluating selectors', [
                        selectors.insights,
                    ]);

                    data.insights = await page.evaluate((jobInsightsSelector: string) => {
                        const nodes = document.querySelectorAll(jobInsightsSelector);
                        return Array.from(nodes).map(e => e.textContent!
                            .replace(/[\n\r\t ]+/g, ' ').trim());
                    }, selectors.insights);

                    // Apply link
                    if (options.applyLink) {
                        const applyLinkRes = await AuthenticatedStrategy._extractApplyLink(page, cdpSession, tag);

                        if (applyLinkRes.success) {
                            data.applyLink = applyLinkRes.url as string;
                        }
                    }
                }
                catch(err: any) {
                    const errorMessage = `${tag}\t${err.message}`;
                    this.scraper.emit(events.scraper.error, errorMessage);
                    jobIndex++;
                    metrics.failed++;
                    continue;
                }

                // Emit data (NB: should be outside of try/catch block to be properly tested)
                this.scraper.emit(events.scraper.data, data);

                jobIndex += 1;
                metrics.processed += 1;
                logger.info(tag, `Processed`);

                // Try fetching more jobs
                if (metrics.processed < options.limit! && jobIndex === jobsTot && jobsTot < paginationSize) {
                    const loadJobsResult = await AuthenticatedStrategy._loadJobs(page, jobsTot);

                    if (loadJobsResult.success) {
                        jobsTot = loadJobsResult.count;
                    }
                }

                if (jobIndex === jobsTot) {
                    break;
                }
            }

            tag = `[${query.query}][${location}]`;

            logger.info(tag, 'No more jobs to process in this page');

            // Check if we reached the limit of jobs to process
            if (metrics.processed === options.limit!) {
                logger.info(tag, 'Query limit reached!')

                // Emit metrics
                this.scraper.emit(events.scraper.metrics, metrics);
                logger.info(tag, 'Metrics:', metrics);

                break;
            }
            else {
                metrics.missed += paginationSize - jobIndex;
            }

            // Emit metrics
            this.scraper.emit(events.scraper.metrics, metrics);
            logger.info(tag, 'Metrics:', metrics);

            // Try to paginate
            paginationIndex += 1;
            logger.info(tag, `Pagination requested [${paginationIndex}]`);
            const paginationResult = await AuthenticatedStrategy._paginate(page, tag);

            if (!paginationResult.success) {
                logger.info(tag, `Couldn\'t find more jobs for the running query`);
                break;
            }
        }

        return { exit: false };
    }
}
