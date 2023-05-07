import { Page } from "puppeteer";
import { convertToDateString } from "../../utils/utils";

export type JobSummeryBase = {
    position: number;
    jobId: string;
    title: string;
    company: string;
    location: string;
    link: string;
    isPromoted: boolean;
    isEasyApply: boolean;
  };
  
type DetailResult = {
    companyLink: string;
    companyImgLink: string;
    place: string;
    date: string;
    dateAgo: string;
  };
  
export class JobSummery {
    public position: number;
    public jobId: string;
    public title: string;
    public company: string;
    public location: string;
    public link: string;
    public isPromoted: boolean;
    public isEasyApply: boolean;
    public insights: string[] = [];
    public applyLink = "";
  
    public description = "";
    public descriptionHTML = "";
    companyLink = "";
    companyImgLink = "";
    place= "";
    date = "";
    dateAgo = "";
  
    constructor(base: JobSummeryBase) {
      this.position = base.position;
      this.jobId = base.jobId;
      this.title = base.title;
      this.company = base.company;
      this.location = base.location;
      this.link = base.link;
      this.isPromoted = base.isPromoted;
      this.isEasyApply = base.isEasyApply;
    }
  
    public normalize() {
      if (!this.date && this.dateAgo) {
        try {
          this.date = convertToDateString(this.dateAgo);
        } catch (err) {
          console.error(`Failed to parse secondary date: ${this.dateAgo}`, err);
        }
      }
    }
  
    public async loadInsights(page: Page): Promise<void> {
      this.insights = await page.evaluate((jobInsightsSelector: string) => {
        const nodes = document.querySelectorAll(jobInsightsSelector);
        return Array.from(nodes).map((e) =>
          (e.textContent || '')
            .replace(/[\n\r\t ]+/g, " ").trim()
        );
      }, "[class=jobs-unified-top-card__job-insight]");
    }
  
    public async loadDescription(page: Page): Promise<void> {
      // Use custom description function if available
      // logger.debug(tag, "Evaluating selectors", [selectors.description]);
      //if (options.descriptionFn) {
      //  const jobDescription = page.evaluate(
      //    `(${options.descriptionFn.toString()})();`,
      //  );
      //  const jobDescriptionHTML = page.evaluate(
      //    (selector) => (document.querySelector(selector)!).outerHTML,
      //    selectors.description,
      //  );
      //  summery.description = (await jobDescription) as string;
      //  summery.descriptionHTML = await jobDescriptionHTML;
      //} else {
        const [jobDescription, jobDescriptionHTML] = await page.evaluate(
          (selector: string) => {
            const el = document.querySelector(selector) as HTMLElement;
            return [el.innerText, el.outerHTML];
          },
          ".jobs-description",
        );
        this.description = jobDescription;
        this.descriptionHTML = jobDescriptionHTML;
      //}
    }
  
    public async updateDetails(page: Page): Promise<void> {
      const r2 = await page.evaluate((jobIndex: number) => {
        const job = document.querySelectorAll("div.job-card-container")[jobIndex]; // jobsSelector
        const link = job.querySelector<HTMLElement>("a.job-card-container__link");
        if (!link) {
          return;
        }
        // Click job link and scroll
        link.scrollIntoView();
        link.click();
        // Extract job link (relative)
        // let company = "";
        let companyLink = "";
        const companySelectors = [
          ".job-card-container__company-name",
          ".job-card-container__primary-description",
        ];
        for (const companySelector of companySelectors) {
          const companyElem = job.querySelector<HTMLElement>(companySelector);
          if (companyElem) {
            // company = companyElem.innerText;
            const href = companyElem.getAttribute("href");
            const { protocol, hostname } = window.location;
            companyLink = href ? `${protocol}//${hostname}${href}` : "";
          }
        }
        const placeSelector = ".artdeco-entity-lockup__caption";
        const dateSelector = "time";
        const companyImgLink =
          job.querySelector<HTMLElement>("img")?.getAttribute("src") ?? "";
        const placeSelected = job.querySelector(placeSelector) as HTMLElement;
        const place = placeSelected ? placeSelected.innerText : "";
        const dateSelected = job.querySelector<HTMLElement>(dateSelector);
        const date =
          (dateSelected ? dateSelected.getAttribute("datetime") : "") || "";
        const dateAgo = job.querySelector<HTMLElement>(
          ".jobs-unified-top-card__posted-date",
        );
  
        const r: DetailResult = {
          // company,
          companyLink,
          companyImgLink,
          place,
          date,
          dateAgo: dateAgo?.innerText || "",
        };
        return r;
      }, this.position);
      if (!r2) {
        throw Error(
          `Failed to extract dwetails for job ${this.position} ${this.jobId} ${this.title}`,
        );
      }
      this.companyLink = r2.companyLink;
      this.companyImgLink = r2.companyImgLink;
      this.place = r2.place;
      this.date = r2.date;
      this.dateAgo = r2.dateAgo;
    }
  }
  