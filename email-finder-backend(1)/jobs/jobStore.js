const { v4: uuidv4 } = require("uuid");
const EventEmitter = require("events");
const { crawlWebsite } = require("../services/crawler");
const { saveEmails } = require("../services/emailStore");

const jobs = new Map();
const CONCURRENCY = 3;

// Jobs auto-expire after 1 hour to avoid unbounded memory growth.
const JOB_TTL_MS = 60 * 60 * 1000;

function createJob(urls) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    urls,
    results: [],
    status: "running",
    emitter: new EventEmitter()
  };
  job.emitter.setMaxListeners(50);
  jobs.set(jobId, job);

  runJob(job).catch((err) => {
    job.status = "error";
    job.emitter.emit("done");
    console.error("Job failed:", err);
  });

  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);

  return jobId;
}

async function runJob(job) {
  let index = 0;

  const worker = async () => {
    while (index < job.urls.length) {
      const myIndex = index++;
      const url = job.urls[myIndex];
      let resultEntry;
      try {
        const result = await crawlWebsite(url, { maxPages: 5 });
        const { saved, error: saveError } = await saveEmails(result.emails);
        resultEntry = { ...result, status: "done", savedToDb: saved, dbError: saveError || null };
      } catch (err) {
        resultEntry = {
          url,
          emails: [],
          pagesVisited: 0,
          status: "error",
          error: err.message
        };
      }
      job.results.push(resultEntry);
      job.emitter.emit("result", resultEntry);
    }
  };

  const workerCount = Math.min(CONCURRENCY, job.urls.length) || 1;
  const workers = Array.from({ length: workerCount }, worker);
  await Promise.all(workers);

  job.status = "done";
  job.emitter.emit("done");
}

function getJob(jobId) {
  return jobs.get(jobId);
}

module.exports = { createJob, getJob };
