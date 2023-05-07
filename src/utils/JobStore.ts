import fs from 'node:fs';
import path from 'node:path';
import { JobSummery } from '../scraper/strategies/JobSummery';

export class JobStorage {
  constructor(private folder = 'jobs') {
    fs.mkdirSync(folder, {recursive: true});
  }

  private getFilePath(jobId: string) {
    return path.join(this.folder, jobId + '.json');
  }

  async contains(jobId: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getFilePath(jobId));
      return true;
    } catch (e) {
      return false;
    }
  }

  save(job: JobSummery) {
    const fn = this.getFilePath(job.jobId);
    fs.writeFileSync(fn, JSON.stringify(job, null, 2));
  }

  async read(jobId: string): Promise<JobSummery> {
    const fn = this.getFilePath(jobId);
    const data = await fs.promises.readFile(fn, {encoding: "utf8"});
    const job = JSON.parse(data) as JobSummery;
    return job;
  }

  async list(): Promise<string[]> {
    const files = await fs.promises.readdir(this.folder);
    return files.filter(f => f.endsWith('.json')).map(a => a.replace('.json', ''));
  }
}
