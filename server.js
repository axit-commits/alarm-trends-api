const express = require('express');
const googleTrends = require('google-trends-api');
const cors = require('cors');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 1800 });

app.use(cors());
app.use(express.json());

// ── Helpers ───────────────────────────────────
function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
}
function getAlarmMessage(t) {
    return { morning:"Good Morning! Here's what's trending while you slept.",
        afternoon:"Afternoon! Here's what's hot right now.",
        evening:"Good Evening! Catch up on today's top trends.",
        night:"Night Owl! Here's what's trending tonight." }[t];
}
function getMockTrends(geo, tod) {
    const morningTopics = ['Morning Yoga','Coffee Recipes','Today News','Weather Update','Stock Market'];
    const nightTopics = ['Netflix Shows','Sleep Tips','Night Sky','Late Night Snacks','Dream Meaning'];
    const topics = (tod === 'morning') ? morningTopics : nightTopics;
    return topics.map((title, i) => ({
        rank: i+1, title,
        traffic: `${Math.floor(Math.random()*500+100)}K+`,
        image: null,
        articles: [{ headline: `Latest update on ${title}`, source: 'News Today', url: '#' }]
    }));
}

const CATS = { all:0, business:16, entertainment:3, health:45, sports:20, technology:5 };

// ── ROUTE: Health Check ───────────────────────
app.get('/', (req, res) => res.json({
    status: 'Alarm Trends API Running!', version: '1.0.0',
    endpoints: {
        daily:    'GET /api/trending?geo=IN&category=all',
        realtime: 'GET /api/realtime?geo=IN',
        alarm:    'GET /api/alarm-trends?geo=IN',
        search:   'GET /api/search?keyword=alarm&geo=IN',
        categories:'GET /api/categories'
    }
}));

// ── ROUTE: Daily Trending ─────────────────────
app.get('/api/trending', async (req, res) => {
    const geo = req.query.geo || 'IN';
    const category = req.query.category || 'all';
    const cacheKey = `daily_${geo}_${category}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, from_cache: true });

    try {
        const result = await googleTrends.dailyTrends({
            trendDate: new Date(), geo, category: CATS[category]||0
        });
        const data = JSON.parse(result);
        const searches = data.default.trendingSearchesDays[0]?.trendingSearches || [];
        const formatted = {
            success:true, from_cache:false, geo, category,
            time_of_day: getTimeOfDay(),
            alarm_message: getAlarmMessage(getTimeOfDay()),
            fetched_at: new Date().toISOString(),
            total: searches.length,
            trending: searches.map((t,i)=>({
                rank:i+1, title:t.title.query,
                traffic:t.formattedTraffic,
                image:t.image?.imageUrl||null,
                related: t.relatedQueries?.map(q=>q.query)||[],
                articles: t.articles?.slice(0,2).map(a=>({
                    headline:a.title, source:a.source, url:a.url, time_ago:a.timeAgo||null
                }))||[]
            }))
        };
        cache.set(cacheKey, formatted);
        res.json(formatted);
    } catch(e) {
        // Fallback mock data so Android app never breaks
        const tod = getTimeOfDay();
        res.json({
            success:true, from_cache:false, geo, category,
            note:'Using demo data - Google Trends geo-blocked. Deploy server outside India or use VPN.',
            time_of_day:tod, alarm_message:getAlarmMessage(tod),
            fetched_at:new Date().toISOString(),
            total:5, trending: getMockTrends(geo, tod)
        });
    }
});

// ── ROUTE: Realtime Trending ──────────────────
app.get('/api/realtime', async (req, res) => {
    const geo = req.query.geo || 'IN';
    const cacheKey = `rt_${geo}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, from_cache:true });

    try {
        const result = await googleTrends.realTimeTrends({ geo, category:'all' });
        const data = JSON.parse(result);
        const stories = data.storySummaries?.trendingStories||[];
        const formatted = {
            success:true, from_cache:false, type:'realtime', geo,
            time_of_day:getTimeOfDay(), alarm_message:getAlarmMessage(getTimeOfDay()),
            fetched_at:new Date().toISOString(), total:stories.length,
            trending: stories.slice(0,15).map((s,i)=>({
                rank:i+1, title:s.title, image:s.image?.imageUrl||null,
                entity_names:s.entityNames||[],
                articles:s.articles?.slice(0,2).map(a=>({
                    headline:a.articleTitle, source:a.source, url:a.url
                }))||[]
            }))
        };
        cache.set(cacheKey, formatted);
        res.json(formatted);
    } catch(e) {
        const tod = getTimeOfDay();
        res.json({
            success:true, note:'Demo data - Deploy outside India for live data.',
            type:'realtime', geo, time_of_day:tod,
            alarm_message:getAlarmMessage(tod),
            fetched_at:new Date().toISOString(),
            trending: getMockTrends(geo, tod)
        });
    }
});

// ── ROUTE: Smart Alarm Trends ─────────────────
app.get('/api/alarm-trends', async (req, res) => {
    const geo = req.query.geo || 'IN';
    const tod = getTimeOfDay();
    const cacheKey = `alarm_${geo}_${tod}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, from_cache:true });

    const useRT = (tod==='afternoon'||tod==='evening');
    try {
        let trendData;
        if (useRT) {
            const r = await googleTrends.realTimeTrends({ geo, category:'all' });
            const d = JSON.parse(r);
            trendData = (d.storySummaries?.trendingStories||[]).slice(0,10).map((s,i)=>({
                rank:i+1, title:s.title, image:s.image?.imageUrl||null,
                entity_names:s.entityNames||[],
                articles:s.articles?.slice(0,1).map(a=>({ headline:a.articleTitle, source:a.source, url:a.url }))||[]
            }));
        } else {
            const r = await googleTrends.dailyTrends({ trendDate:new Date(), geo });
            const d = JSON.parse(r);
            trendData = (d.default.trendingSearchesDays[0]?.trendingSearches||[]).slice(0,10).map((t,i)=>({
                rank:i+1, title:t.title.query, traffic:t.formattedTraffic,
                image:t.image?.imageUrl||null,
                articles:t.articles?.slice(0,1).map(a=>({ headline:a.title, source:a.source, url:a.url }))||[]
            }));
        }
        const formatted = {
            success:true, from_cache:false, type:useRT?'realtime':'daily',
            time_of_day:tod, alarm_message:getAlarmMessage(tod), geo,
            fetched_at:new Date().toISOString(),
            top_trend:trendData[0]?.title||'No trends', trending:trendData
        };
        cache.set(cacheKey, formatted);
        res.json(formatted);
    } catch(e) {
        const mockData = getMockTrends(geo, tod);
        res.json({
            success:true, note:'Demo data - Deploy outside India for live data.',
            type:useRT?'realtime':'daily', time_of_day:tod,
            alarm_message:getAlarmMessage(tod), geo,
            fetched_at:new Date().toISOString(),
            top_trend: mockData[0].title, trending: mockData
        });
    }
});

// ── ROUTE: Search Interest ────────────────────
app.get('/api/search', async (req, res) => {
    const kw = req.query.keyword;
    const geo = req.query.geo || 'IN';
    if (!kw) return res.status(400).json({ success:false, error:'Provide ?keyword=alarm' });
    try {
        const r = await googleTrends.interestOverTime({
            keyword:kw, geo,
            startTime: new Date(Date.now() - 7*24*60*60*1000),
            endTime: new Date()
        });
        const d = JSON.parse(r);
        const tl = d.default?.timelineData||[];
        res.json({
            success:true, keyword:kw, geo, period:'Last 7 days',
            fetched_at:new Date().toISOString(),
            peak_interest:Math.max(...tl.map(d=>d.value[0]||0)),
            data_points:tl.map(d=>({
                date:new Date(d.time*1000).toISOString().split('T')[0],
                value:d.value[0]||0, is_partial:d.isPartial||false
            }))
        });
    } catch(e) {
        res.status(500).json({ success:false, error:'Search failed', message:e.message });
    }
});

// ── ROUTE: Categories ─────────────────────────
app.get('/api/categories', (req, res) => res.json({
    success:true,
    available_categories: Object.keys(CATS),
    available_geo_codes: {
        'IN':'India','US':'United States','GB':'United Kingdom',
        'PK':'Pakistan','AU':'Australia','CA':'Canada','GLOBAL':'Worldwide'
    }
}));

app.listen(PORT, ()=>{
    console.log('\nAlarm Trends API is running!');
    console.log('URL: http://localhost:'+PORT);
    console.log('\nEndpoints:');
    console.log('  GET /                    -> Health check');
    console.log('  GET /api/trending        -> Daily trending topics');
    console.log('  GET /api/realtime        -> Realtime trending');
    console.log('  GET /api/alarm-trends    -> Smart alarm trends (time-based)');
    console.log('  GET /api/search?keyword= -> Search interest over time');
    console.log('  GET /api/categories      -> Available options\n');
});
