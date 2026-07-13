import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: `${API_BASE}/api/crawl`
});

export function crawlSingleUrl(url) {
  return api.post("/single", { url }).then((res) => res.data);
}

export function uploadBulkCsv(file) {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/bulk", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  }).then((res) => res.data);
}

export function getJobResults(jobId) {
  return api.get(`/bulk/${jobId}/results`).then((res) => res.data);
}

export function bulkDownloadUrl(jobId) {
  return `${API_BASE}/api/crawl/bulk/${jobId}/download`;
}

export function fetchStoredEmails({ page = 1, pageSize = 100, search = "" } = {}) {
  return axios
    .get(`${API_BASE}/api/emails`, { params: { page, pageSize, search } })
    .then((res) => res.data);
}

export function subscribeToJob(jobId, { onResult, onDone }) {
  const source = new EventSource(`${API_BASE}/api/crawl/bulk/${jobId}/stream`);

  source.addEventListener("result", (e) => {
    onResult(JSON.parse(e.data));
  });
  source.addEventListener("done", (e) => {
    onDone(JSON.parse(e.data));
    source.close();
  });
  source.onerror = () => {
    // Connection dropped; the poll fallback (getJobResults) can be used by caller.
    source.close();
  };

  return () => source.close();
}
