import { Page } from 'puppeteer';
import { JobSummery, JobSummeryBase } from './JobSummery';

export async function jobSummery(page: Page): Promise<JobSummery[]> {
  const sumerys: JobSummeryBase[] = await page.evaluate(() => {
    const jobs = Array.from(document.querySelectorAll('div.job-card-container'));
    console.log(`${jobs.length} jobs found.}`);
    debugger;
    const asArray = jobs.map((job, position) => {
      const mainLink = job.querySelector<HTMLElement>('a.job-card-container__link');
      if (!mainLink)
        throw new Error('Failed to find main link');
      const sideflags: string = ((job.querySelector<HTMLElement>('.job-card-list__footer-wrapper') || {innerText:''})).innerText || '';
      const companyDiv = job.querySelector<HTMLElement>('.job-card-container__primary-description');
      const locationDiv = job.querySelector<HTMLElement>('.job-card-container__metadata-item');
      const title = mainLink.innerText;
      const jobId = job.getAttribute('data-job-id') || '';
      const isPromoted = sideflags.includes('Promoted');
      const isEasyApply = sideflags.includes('Easy Apply');
      const company = companyDiv ? companyDiv.innerText : '';
      const location = locationDiv ? locationDiv.innerText : '';
      const { protocol, hostname } = window.location;
      const link = `${protocol}//${hostname}${mainLink.getAttribute('href')}`;
      const result: JobSummeryBase = {
        position,
        jobId,
        title,
        company,
        location,
        link,
        isPromoted,
        isEasyApply,
      };
      return result;
    });
    return asArray;
  });

  return sumerys.map((job) => new JobSummery(job));
}
