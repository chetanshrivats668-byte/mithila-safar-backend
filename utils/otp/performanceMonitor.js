/**
 * Performance Monitor for OTP Operations
 * Tracks response times and identifies bottlenecks
 */

const performanceMetrics = {
    emailOtp: {
        totalRequests: 0,
        totalTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgResponseTime: 0
    },
    smsOtp: {
        totalRequests: 0,
        totalTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgResponseTime: 0
    },
    emailSend: {
        totalRequests: 0,
        totalTime: 0,
        failures: 0,
        avgResponseTime: 0
    }
};

// Track performance for email OTP verification
export function trackEmailOtpVerification(duration, wasCacheHit = false) {
    performanceMetrics.emailOtp.totalRequests++;
    performanceMetrics.emailOtp.totalTime += duration;
    performanceMetrics.emailOtp.avgResponseTime = 
        performanceMetrics.emailOtp.totalTime / performanceMetrics.emailOtp.totalRequests;
    
    if (wasCacheHit) {
        performanceMetrics.emailOtp.cacheHits++;
    } else {
        performanceMetrics.emailOtp.cacheMisses++;
    }
}

// Track performance for SMS OTP verification
export function trackSmsOtpVerification(duration, wasCacheHit = false) {
    performanceMetrics.smsOtp.totalRequests++;
    performanceMetrics.smsOtp.totalTime += duration;
    performanceMetrics.smsOtp.avgResponseTime = 
        performanceMetrics.smsOtp.totalTime / performanceMetrics.smsOtp.totalRequests;
    
    if (wasCacheHit) {
        performanceMetrics.smsOtp.cacheHits++;
    } else {
        performanceMetrics.smsOtp.cacheMisses++;
    }
}

// Track performance for email sending
export function trackEmailSend(duration, success = true) {
    performanceMetrics.emailSend.totalRequests++;
    performanceMetrics.emailSend.totalTime += duration;
    performanceMetrics.emailSend.avgResponseTime = 
        performanceMetrics.emailSend.totalTime / performanceMetrics.emailSend.totalRequests;
    
    if (!success) {
        performanceMetrics.emailSend.failures++;
    }
}

// Get performance metrics
export function getPerformanceMetrics() {
    return {
        ...performanceMetrics,
        timestamp: new Date().toISOString()
    };
}

// Log performance summary
export function logPerformanceSummary() {
    const metrics = getPerformanceMetrics();
    console.log('=== OTP Performance Summary ===');
    console.log(`Email OTP - Total: ${metrics.emailOtp.totalRequests}, Avg: ${metrics.emailOtp.avgResponseTime.toFixed(2)}ms, Cache Hit Rate: ${((metrics.emailOtp.cacheHits / metrics.emailOtp.totalRequests) * 100).toFixed(1)}%`);
    console.log(`SMS OTP - Total: ${metrics.smsOtp.totalRequests}, Avg: ${metrics.smsOtp.avgResponseTime.toFixed(2)}ms, Cache Hit Rate: ${((metrics.smsOtp.cacheHits / metrics.smsOtp.totalRequests) * 100).toFixed(1)}%`);
    console.log(`Email Send - Total: ${metrics.emailSend.totalRequests}, Avg: ${metrics.emailSend.avgResponseTime.toFixed(2)}ms, Success Rate: ${(((metrics.emailSend.totalRequests - metrics.emailSend.failures) / metrics.emailSend.totalRequests) * 100).toFixed(1)}%`);
    console.log('================================');
}

// Reset performance metrics
export function resetPerformanceMetrics() {
    Object.keys(performanceMetrics).forEach(key => {
        performanceMetrics[key] = {
            totalRequests: 0,
            totalTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgResponseTime: 0
        };
    });
    performanceMetrics.emailSend.failures = 0;
}