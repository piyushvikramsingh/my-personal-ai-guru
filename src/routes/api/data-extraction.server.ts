/**
 * Web data extraction and analysis utilities
 * Provides capabilities to fetch and analyze data from various sources
 */

// Parse structured data from URL
export async function extractWebPageData(url: string): Promise<{
  title: string;
  description: string;
  content: string;
  author?: string;
  published?: string;
  tags: string[];
  links: string[];
} | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract Open Graph / Meta tags
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || 
                       html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'Untitled';
    
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                      html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    const description = descMatch ? descMatch[1] : '';
    
    const authorMatch = html.match(/<meta\s+name="author"\s+content="([^"]+)"/i);
    const author = authorMatch ? authorMatch[1] : undefined;
    
    const publishedMatch = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
    const published = publishedMatch ? publishedMatch[1] : undefined;
    
    // Extract links
    const linkMatches = [...html.matchAll(/<a\s+href="([^"]+)"/gi)];
    const links = [...new Set(linkMatches.map(m => m[1]).filter(l => l.startsWith('http')))].slice(0, 10);
    
    // Extract main content (text nodes without tags)
    const contentMatch = html.match(/<body[^>]*>(.+?)<\/body>/is);
    let content = '';
    if (contentMatch) {
      content = contentMatch[1]
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 2000);
    }
    
    return {
      title,
      description,
      content: content.trim(),
      author,
      published,
      tags: [],
      links
    };
  } catch (error) {
    console.error('Error extracting webpage:', error);
    return null;
  }
}

// Search for information
export async function googleSearch(query: string, limit: number = 5): Promise<{
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  totalResults: number;
}> {
  try {
    // Use a public search API or implement custom search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      return { results: [], totalResults: 0 };
    }
    
    const html = await response.text();
    
    // Parse search results from Google HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultMatches = [...html.matchAll(/(?:<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>.*?<span[^>]*>([^<]+)<\/span>)/gi)];
    
    for (const match of resultMatches.slice(0, limit)) {
      let url = match[1];
      if (url.startsWith('/url?q=')) {
        url = new URL('http://google.com' + url).searchParams.get('q') || url;
      }
      if (url && url.startsWith('http') && !url.includes('google.com')) {
        results.push({
          title: match[2]?.trim() || '',
          url,
          snippet: match[3]?.trim() || ''
        });
      }
    }
    
    return { results, totalResults: results.length };
  } catch (error) {
    console.error('Error searching:', error);
    return { results: [], totalResults: 0 };
  }
}

// Extract YouTube video information
export async function getYouTubeInfo(videoUrl: string): Promise<{
  title: string;
  description: string;
  channelName: string;
  duration: string;
  views: string;
  uploadedAt: string;
  tags: string[];
  captions?: string;
} | null> {
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract JSON-LD metadata
    const jsonMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.+?)<\/script>/s);
    const metaMatch = html.match(/"title":\s*{"simpleText":"([^"]+)"}/);
    const descMatch = html.match(/"description":\s*{"simpleText":"([^"]+)"}/);
    const channelMatch = html.match(/"shortBylineText":\s*{"simpleText":"([^"]+)"}/);
    const viewMatch = html.match(/"viewCountText":\s*{"simpleText":"([^"]+)"}/);
    const uploadMatch = html.match(/"uploadDate":"([^"]+)"/);
    
    return {
      title: metaMatch ? metaMatch[1] : 'Unknown Title',
      description: descMatch ? descMatch[1] : '',
      channelName: channelMatch ? channelMatch[1] : 'Unknown Channel',
      duration: '',
      views: viewMatch ? viewMatch[1] : 'N/A',
      uploadedAt: uploadMatch ? uploadMatch[1] : '',
      tags: [],
      captions: undefined
    };
  } catch (error) {
    console.error('Error extracting YouTube info:', error);
    return null;
  }
}

// Analyze sentiment and extract insights
export async function analyzeData(content: string): Promise<{
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  topics: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}> {
  // Basic analysis logic
  const lines = content.split('\n').filter(l => l.trim());
  
  const sentiment = content.includes('great') || content.includes('excellent') ? 'positive' :
                    content.includes('bad') || content.includes('poor') ? 'negative' : 'neutral';
  
  const summary = lines.slice(0, 3).join(' ').slice(0, 200);
  const keyPoints = lines.filter(l => l.length > 30).slice(0, 5);
  
  const words = content.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const complexity = uniqueWords.size > 500 ? 'complex' : uniqueWords.size > 200 ? 'moderate' : 'simple';
  
  return {
    summary,
    keyPoints,
    sentiment,
    topics: [...new Set(keyPoints.flatMap(p => p.split(/\s+/).filter(w => w.length > 5)))].slice(0, 5),
    complexity
  };
}

// Compare multiple sources
export async function compareMultipleSources(query: string): Promise<{
  sources: Array<{
    title: string;
    url: string;
    summary: string;
    sentiment: string;
  }>;
  consensus: string;
  contradictions: string[];
}> {
  try {
    const searchResults = await googleSearch(query, 3);
    const sources = [];
    
    for (const result of searchResults.results) {
      const data = await extractWebPageData(result.url);
      if (data) {
        const analysis = await analyzeData(data.content);
        sources.push({
          title: result.title,
          url: result.url,
          summary: analysis.summary,
          sentiment: analysis.sentiment
        });
      }
    }
    
    return {
      sources,
      consensus: 'Based on multiple sources...',
      contradictions: []
    };
  } catch (error) {
    console.error('Error comparing sources:', error);
    return { sources: [], consensus: '', contradictions: [] };
  }
}

export type WebDataContext = {
  sources: string[];
  data: Record<string, unknown>;
  timestamp: string;
  analysisType: 'search' | 'webpage' | 'youtube' | 'comparison';
};
