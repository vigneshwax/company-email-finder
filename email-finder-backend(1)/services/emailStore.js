const { supabase } = require("./supabaseClient");

const TABLE = "emails";

/**
 * Insert newly-found emails into the Supabase `emails` table, skipping any
 * that are already stored (dedupe by email address).
 */
async function saveEmails(emails) {
  if (!supabase) return { saved: 0, error: "Supabase not configured" };
  if (!emails || !emails.length) return { saved: 0 };

  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select("email")
    .in("email", emails);

  if (fetchErr) {
    console.error("[supabase] failed to check existing emails:", fetchErr.message);
    return { saved: 0, error: fetchErr.message };
  }

  const existingSet = new Set((existing || []).map((r) => r.email));
  const newEmails = emails.filter((e) => !existingSet.has(e));

  if (!newEmails.length) return { saved: 0 };

  const rows = newEmails.map((email) => ({
    email,
    active: 1,
    replied: false
  }));

  const { error: insertErr } = await supabase.from(TABLE).insert(rows);

  if (insertErr) {
    console.error("[supabase] failed to insert emails:", insertErr.message);
    return { saved: 0, error: insertErr.message };
  }

  return { saved: newEmails.length };
}

/**
 * Fetch stored emails, newest first, with optional search + pagination.
 */
async function fetchEmails({ page = 1, pageSize = 100, search = "" } = {}) {
  if (!supabase) return { rows: [], total: 0, error: "Supabase not configured" };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("email", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[supabase] failed to fetch emails:", error.message);
    return { rows: [], total: 0, error: error.message };
  }

  return { rows: data, total: count ?? data.length };
}

module.exports = { saveEmails, fetchEmails };
