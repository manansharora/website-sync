import jwt from "jsonwebtoken";

const ACCEPT_VERSION = "v5.0";

function parseAdminKey(adminKey) {
  const parts = adminKey.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid GHOST_ADMIN_API_KEY format. Expected <id>:<secret>.");
  }

  return { id: parts[0], secret: parts[1] };
}

function buildGhostJwt(adminKey) {
  const { id, secret } = parseAdminKey(adminKey);
  const secretBuffer = Buffer.from(secret, "hex");

  return jwt.sign({}, secretBuffer, {
    keyid: id,
    algorithm: "HS256",
    expiresIn: "5m",
    audience: "/admin/"
  });
}

export class GhostAdminApiError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = "GhostAdminApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class GhostAdminApi {
  constructor({ baseUrl, adminKey }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.adminKey = adminKey;
  }

  async request(path, { method = "GET", query = null, body = null } = {}) {
    const token = buildGhostJwt(this.adminKey);
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Ghost ${token}`,
        "Accept-Version": ACCEPT_VERSION,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    if (!response.ok) {
      throw new GhostAdminApiError(
        `Ghost API request failed (${response.status}).`,
        response.status,
        text
      );
    }

    if (!text) {
      return {};
    }

    return JSON.parse(text);
  }

  async getPostBySlug(slug) {
    let result;
    try {
      result = await this.request(`/posts/slug/${encodeURIComponent(slug)}/`, {
        query: { formats: "html" }
      });
    } catch (error) {
      if (error instanceof GhostAdminApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }

    return result.posts?.[0] ?? null;
  }

  async createPublishedPost({ title, slug, html }) {
    const result = await this.request("/posts/", {
      method: "POST",
      query: { source: "html" },
      body: {
        posts: [
          {
            title,
            slug,
            status: "published",
            html
          }
        ]
      }
    });

    return result.posts?.[0] ?? null;
  }

  async updatePostHtml({ id, updatedAt, html, status }) {
    const result = await this.request(`/posts/${encodeURIComponent(id)}/`, {
      method: "PUT",
      query: { source: "html" },
      body: {
        posts: [
          {
            updated_at: updatedAt,
            html,
            status
          }
        ]
      }
    });

    return result.posts?.[0] ?? null;
  }
}
