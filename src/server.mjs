import "dotenv/config";
import Fastify from "fastify";
import { GhostAdminApi, GhostAdminApiError } from "./ghost.mjs";
import { getWeeklyMondayInfo } from "./date.mjs";
import { buildTweetEmbedHtml, normalizeTweetUrl, postContainsTweet } from "./normalize.mjs";

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function requiredEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function extractBearerToken(headerValue) {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

function appendEmbed(existingHtml, embedHtml) {
  if (!existingHtml || !existingHtml.trim()) {
    return embedHtml;
  }

  return `${existingHtml.trimEnd()}\n\n${embedHtml}`;
}

const port = Number(getEnv("PORT", "8787"));
const hookBearerToken = requiredEnv("HOOK_BEARER_TOKEN");
const ghostAdminApiUrl = requiredEnv("GHOST_ADMIN_API_URL");
const ghostAdminApiKey = requiredEnv("GHOST_ADMIN_API_KEY");
const weekTimezone = getEnv("WEEK_TIMEZONE", "Asia/Kolkata");

const ghostApi = new GhostAdminApi({
  baseUrl: ghostAdminApiUrl,
  adminKey: ghostAdminApiKey
});

const app = Fastify({
  logger: true
});

app.get("/health", async () => ({ ok: true }));

app.post("/add-tweet", async (request, reply) => {
  const requestToken = extractBearerToken(request.headers.authorization);
  if (!requestToken || requestToken !== hookBearerToken) {
    return reply.code(401).send({ ok: false, error: "Unauthorized." });
  }

  const body = request.body ?? {};
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return reply.code(400).send({ ok: false, error: "Field 'url' is required." });
  }

  let normalized;
  try {
    normalized = normalizeTweetUrl(rawUrl);
  } catch (error) {
    return reply.code(400).send({ ok: false, error: error.message });
  }

  const weekInfo = getWeeklyMondayInfo(weekTimezone, new Date());
  const embedHtml = buildTweetEmbedHtml(normalized.canonicalUrl);

  try {
    let post = await ghostApi.getPostBySlug(weekInfo.slug);

    if (!post) {
      post = await ghostApi.createPublishedPost({
        title: weekInfo.title,
        slug: weekInfo.slug,
        html: embedHtml
      });
      if (!post) {
        throw new Error("Ghost API did not return created post payload.");
      }

      return reply.code(200).send({
        ok: true,
        status: "added",
        slug: weekInfo.slug,
        post_id: post?.id ?? null,
        post_url: post?.url ?? null
      });
    }

    if (postContainsTweet(post.html ?? "", normalized.tweetId)) {
      return reply.code(200).send({
        ok: true,
        status: "duplicate",
        slug: weekInfo.slug,
        post_id: post.id,
        post_url: post.url ?? null
      });
    }

    const updatedHtml = appendEmbed(post.html ?? "", embedHtml);
    const updatedPost = await ghostApi.updatePostHtml({
      id: post.id,
      updatedAt: post.updated_at,
      html: updatedHtml,
      status: post.status ?? "published"
    });
    if (!updatedPost) {
      throw new Error("Ghost API did not return updated post payload.");
    }

    return reply.code(200).send({
      ok: true,
      status: "added",
      slug: weekInfo.slug,
      post_id: updatedPost.id,
      post_url: updatedPost.url ?? post.url ?? null
    });
  } catch (error) {
    request.log.error({ err: error }, "Failed to sync tweet to Ghost.");

    if (error instanceof GhostAdminApiError) {
      return reply.code(502).send({
        ok: false,
        error: `Ghost API error (${error.statusCode}).`
      });
    }

    return reply.code(500).send({ ok: false, error: "Internal server error." });
  }
});

app.setErrorHandler((error, _request, reply) => {
  reply.code(400).send({ ok: false, error: error.message });
});

async function start() {
  await app.listen({ host: "127.0.0.1", port });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
