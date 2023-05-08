// import { EventMap } from "typed-emitter";
import { JobSummery } from "./strategies/JobSummery";

type BrowserEvent =
  | "disconnected"
  | "targetchanged"
  | "targetcreated"
  | "targetdestroyed";


  export type Step1Ret = {
    jobId?: string | null;
    jobLink: string,
    title: string,
    company: string;
    companyLink?: string;
    companyImgLink?: string;
    place: string,
    date?: string | null;
    isPromoted: boolean,
    isEasyApply: boolean,
}

export interface IMetrics {
  processed: number; // Number of successfully processed jobs
  failed: number; // Number of jobs failed to process (because of an error)
  missed: number; // Number of missed jobs to load during scraping
  skipped: number; // Skipped jobs
}

interface IEvents {
  scraper: {
    data: "scraper:data";
    error: "scraper:error";
    metrics: "scraper:metrics";
    invalidSession: "scraper:invalid-session";
    end: "scraper:end";
  };
  puppeteer: {
    browser: {
      disconnected: BrowserEvent;
      targetchanged: BrowserEvent;
      targetcreated: BrowserEvent;
      targetdestroyed: BrowserEvent;
    };
  };
}

const events: IEvents = {
  scraper: {
    data: "scraper:data",
    error: "scraper:error",
    metrics: "scraper:metrics",
    invalidSession: "scraper:invalid-session",
    end: "scraper:end",
  },
  puppeteer: {
    browser: {
      disconnected: "disconnected" as BrowserEvent,
      targetchanged: "targetchanged" as BrowserEvent,
      targetcreated: "targetcreated" as BrowserEvent,
      targetdestroyed: "targetdestroyed" as BrowserEvent,
    },
  },
};

export type IEventListeners = {
  ["scraper:data"]: (data: JobSummery) => void;
  ["scraper:error"]: (error: Error | string) => void;
  ["scraper:metrics"]: (data: IMetrics) => void;
  ["scraper:invalid-session"]: () => void;
  ["scraper:end"]: () => void;
  ["disconnected"]: (...args: any[]) => void;
  ["targetchanged"]: (...args: any[]) => void;
  ["targetcreated"]: (...args: any[]) => void;
  ["targetdestroyed"]: (...args: any[]) => void;
};

export { events };
