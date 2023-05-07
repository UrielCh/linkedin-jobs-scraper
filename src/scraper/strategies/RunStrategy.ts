import { BrowserContext, Page, CDPSession } from "puppeteer";
import { IQuery } from "../query";
import { LinkedinScraper } from "../LinkedinScraper";

export interface IRunStrategyResult {
    exit: boolean;
}

export abstract class RunStrategy {
    protected scraper: LinkedinScraper;

    constructor(scraper: LinkedinScraper) {
        this.scraper = scraper;
    }

    abstract run(
        browser: BrowserContext,
        page: Page,
        cdpSession: CDPSession,
        url: string,
        query: IQuery,
        location: string,
    ): Promise<IRunStrategyResult>;
}

export interface ILoadResult {
    success: boolean;
    error?: string | Error;
}
