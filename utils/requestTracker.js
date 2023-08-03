let requests = [];
const limit = 280;
const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds

const requestTracker = (req, res, next) => {
    const now = Date.now();
    requests = requests.filter(req => now - req.time < timeWindow);

    requests.push({ time: now, method: req.method, url: req.url });

    if (requests.length >= limit) {
        console.warn("Request limit reached!");
    }

    next();
};

module.exports = requestTracker;