import { Redis } from '@upstash/redis';
import { nanoid } from 'nanoid';

// Initialize Redis - handle both Vercel KV naming and Upstash naming
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Create a new share
      const { ascii, settings, preview } = req.body;

      if (!ascii) {
        return res.status(400).json({ error: 'ASCII content is required' });
      }

      // Generate unique ID
      const id = nanoid(10);

      // Store in Redis with 30-day expiration (in seconds)
      const data = {
        ascii,
        settings: settings || {},
        preview: preview || null,
        createdAt: Date.now(),
        views: 0
      };

      await redis.set(`img:${id}`, JSON.stringify(data), { ex: 60 * 60 * 24 * 30 });

      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

      return res.status(201).json({
        success: true,
        id,
        shareUrl: `${baseUrl}/view.html?id=${id}`
      });
    }

    if (req.method === 'GET') {
      // Retrieve a share
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Share ID is required' });
      }

      const rawData = await redis.get(`img:${id}`);

      if (!rawData) {
        return res.status(404).json({ error: 'Share not found or expired' });
      }

      // Parse the data (Upstash may return string or object)
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

      // Increment view count
      const updatedData = { ...data, views: (data.views || 0) + 1 };
      await redis.set(`img:${id}`, JSON.stringify(updatedData), { ex: 60 * 60 * 24 * 30 });

      return res.status(200).json({
        success: true,
        ...updatedData
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Share API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
