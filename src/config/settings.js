/**
 * Application settings and thresholds
 * @module settings
 */

const settings = {
    /** FID Thresholds for role notifications */
    fidThresholds: {
        below1000: 1000,
        below5000: 5000,
        below10000: 10000
    },

    /** Follower Thresholds for role notifications */
    followerThresholds: {
        over5000: 5000,
        over10000: 10000,
        over20000: 20000,
        over50000: 50000,
        over100000: 100000,
        over200000: 200000
    },

    features: {
        displayImages: true  // Toggle this to enable/disable images
    }
};

// Validate thresholds
Object.entries(settings.fidThresholds).forEach(([name, value]) => {
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`Invalid ${name} FID threshold`);
    }
});

Object.entries(settings.followerThresholds).forEach(([name, value]) => {
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`Invalid ${name} follower threshold`);
    }
});

module.exports = settings; 