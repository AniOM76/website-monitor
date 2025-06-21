// monitor.js - Main monitoring application for Railway
import fetch from 'node-fetch';
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const config = {
  website: {
    url: process.env.WEBSITE_URL,
    loginUrl: process.env.LOGIN_URL,
    username: process.env.USERNAME,
    password: process.env.PASSWORD
  },
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    recipients: process.env.RECIPIENT_EMAILS?.split(',').map(email => email.trim()) || []
  },
  monitoring: {
    schedule: process.env.CRON_SCHEDULE || '0 */4 * * *', // Every 4 hours by default
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000') // 10 seconds
  }
};

class WebsiteMonitor {
  constructor() {
    // No email setup needed for logging version
    console.log('📝 Website Monitor initialized with logging output');
  }

  async runMonitoringCycle() {
    console.log(`🔍 Starting monitoring cycle at ${new Date().toISOString()}`);
    
    try {
      const results = await this.runAllTests();
      this.logResults(results);
      
      console.log(`✅ Monitoring cycle completed. Status: ${results.overallStatus}`);
      return results;
    } catch (error) {
      console.error('❌ Monitoring cycle failed:', error);
      this.logError(error);
      throw error;
    }
  }

  async runAllTests() {
    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
      overallStatus: 'UNKNOWN'
    };

    try {
      // Test 1: Basic connectivity
      console.log('Testing connectivity...');
      const connectivityTest = await this.testConnectivity();
      results.tests.push(connectivityTest);

      // Test 2: Login functionality
      console.log('Testing login...');
      const loginTest = await this.testLogin();
      results.tests.push(loginTest);

      // Test 3: Authenticated page access
      if (loginTest.sessionCookie) {
        console.log('Testing authenticated access...');
        const authTest = await this.testAuthenticatedAccess(loginTest.sessionCookie);
        results.tests.push(authTest);
      } else {
        results.tests.push({
          test: 'Authenticated Access',
          passed: false,
          details: 'Skipped due to login failure'
        });
      }

      // Determine overall status
      results.overallStatus = results.tests.every(test => test.passed) ? 'PASS' : 'FAIL';
      
    } catch (error) {
      results.overallStatus = 'ERROR';
      results.error = error.message;
      console.error('Test execution error:', error);
    }

    return results;
  }

  async testConnectivity() {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.monitoring.timeout);

      const response = await fetch(config.website.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Website-Monitor/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      return {
        test: 'Connectivity',
        passed: response.ok,
        statusCode: response.status,
        responseTime: `${responseTime}ms`,
        details: response.ok ? 'Website is accessible' : `HTTP ${response.status} - ${response.statusText}`
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        test: 'Connectivity',
        passed: false,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message,
        responseTime: `${responseTime}ms`,
        details: 'Failed to connect to website'
      };
    }
  }

  async testLogin() {
    try {
      // Get login page first (for CSRF tokens, etc.)
      const loginPageResponse = await fetch(config.website.loginUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Website-Monitor/1.0'
        }
      });

      if (!loginPageResponse.ok) {
        return {
          test: 'Login',
          passed: false,
          statusCode: loginPageResponse.status,
          details: `Login page not accessible: HTTP ${loginPageResponse.status}`
        };
      }

      // Attempt login with correct field names for snapnotes.ai
      const loginData = new URLSearchParams({
        email: config.website.username,    // snapnotes uses 'email' not 'username'
        password: config.website.password
      });

      const loginResponse = await fetch(config.website.loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Website-Monitor/1.0',
          'Referer': config.website.loginUrl
        },
        body: loginData,
        redirect: 'manual'
      });

      // Determine if login was successful
      const isSuccess = this.isLoginSuccessful(loginResponse);
      const sessionCookie = this.extractSessionCookie(loginResponse);

      return {
        test: 'Login',
        passed: isSuccess,
        statusCode: loginResponse.status,
        sessionCookie: sessionCookie,
        details: isSuccess ? 'Login successful' : 'Login failed - check credentials or form structure'
      };
    } catch (error) {
      return {
        test: 'Login',
        passed: false,
        error: error.message,
        details: 'Login test encountered an error'
      };
    }
  }

  isLoginSuccessful(response) {
    // Common indicators of successful login
    const successIndicators = [
      response.status === 302, // Redirect after login
      response.status === 200, // Success response
      response.headers.get('location')?.includes('dashboard'),
      response.headers.get('location')?.includes('home'),
      response.headers.get('location')?.includes('profile'),
      !response.headers.get('location')?.includes('login') // Not redirected back to login
    ];

    return successIndicators.some(indicator => indicator);
  }

  extractSessionCookie(response) {
    const setCookieHeaders = response.headers.raw()['set-cookie'];
    if (!setCookieHeaders) return null;
    
    // Get all cookies for authentication
    const cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
    return cookies;
  }

  async testAuthenticatedAccess(sessionCookie) {
    if (!sessionCookie) {
      return {
        test: 'Authenticated Access',
        passed: false,
        details: 'No session cookie available from login'
      };
    }

    try {
      // For snapnotes.ai, the protected page is at app.snapnotes.ai/index
      const protectedUrl = 'https://app.snapnotes.ai/index';
      
      const response = await fetch(protectedUrl, {
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
          'User-Agent': 'Website-Monitor/1.0'
        }
      });

      const isAuthenticated = response.ok && !response.url.includes('login');

      return {
        test: 'Authenticated Access',
        passed: isAuthenticated,
        statusCode: response.status,
        finalUrl: response.url, // Show where we got redirected
        testedUrl: protectedUrl,
        details: isAuthenticated ? 'Successfully accessed protected page' : `Could not access protected page - redirected to: ${response.url}`
      };
    } catch (error) {
      return {
        test: 'Authenticated Access',
        passed: false,
        error: error.message,
        details: 'Failed to test authenticated access'
      };
    }
  }

  logResults(results) {
    console.log('\n📊 MONITORING REPORT');
    console.log('==========================================');
    console.log(`🕐 Timestamp: ${results.timestamp}`);
    console.log(`🎯 Overall Status: ${results.overallStatus}`);
    console.log(`🌐 Website: ${config.website.url}`);
    console.log('');
    
    console.log('📋 Test Results:');
    console.log('------------------------------------------');
    
    results.tests.forEach((test, index) => {
      const icon = test.passed ? '✅' : '❌';
      const status = test.passed ? 'PASS' : 'FAIL';
      
      console.log(`${index + 1}. ${icon} ${test.test}: ${status}`);
      
      if (test.statusCode) {
        console.log(`   📡 Status Code: ${test.statusCode}`);
      }
      
      if (test.responseTime) {
        console.log(`   ⏱️  Response Time: ${test.responseTime}`);
      }
      
      if (test.testedUrl && test.testedUrl !== config.website.url) {
        console.log(`   🔗 Tested URL: ${test.testedUrl}`);
      }
      
      console.log(`   📝 Details: ${test.details}`);
      
      if (test.error) {
        console.log(`   ⚠️  Error: ${test.error}`);
      }
      
      if (test.finalUrl && test.finalUrl !== test.testedUrl) {
        console.log(`   🔄 Redirected to: ${test.finalUrl}`);
      }
      
      console.log('');
    });
    
    console.log('==========================================');
    
    // Summary stats
    const passed = results.tests.filter(t => t.passed).length;
    const failed = results.tests.filter(t => !t.passed).length;
    console.log(`📈 Summary: ${passed} passed, ${failed} failed out of ${results.tests.length} tests`);
    
    if (results.overallStatus === 'PASS') {
      console.log('🎉 All systems operational!');
    } else {
      console.log('🚨 Issues detected - website monitoring failed!');
    }
    
    console.log('\n');
  }

  logError(error) {
    console.log('\n🚨 MONITORING SYSTEM ERROR');
    console.log('==========================================');
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`❌ Error: ${error.message}`);
    console.log(`📍 Stack: ${error.stack}`);
    console.log('==========================================\n');
  }

  generateTextReport(results) {
    const lines = [
      '=== Website Monitor Report ===',
      `Status: ${results.overallStatus}`,
      `Time: ${results.timestamp}`,
      `Website: ${config.website.url}`,
      '',
      'Test Results:'
    ];

    results.tests.forEach(test => {
      lines.push(`\n${test.test}: ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
      if (test.statusCode) lines.push(`  Status Code: ${test.statusCode}`);
      if (test.responseTime) lines.push(`  Response Time: ${test.responseTime}`);
      if (test.details) lines.push(`  Details: ${test.details}`);
      if (test.error) lines.push(`  Error: ${test.error}`);
    });

    lines.push('', '---', 'Generated by Website Monitor');
    return lines.join('\n');
  }

  generateHtmlReport(results) {
    const statusColor = results.overallStatus === 'PASS' ? '#28a745' : '#dc3545';
    const statusIcon = results.overallStatus === 'PASS' ? '✅' : '❌';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background-color: ${statusColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .test-result { margin: 15px 0; padding: 15px; border-radius: 6px; border-left: 4px solid #ddd; }
          .test-result.passed { border-left-color: #28a745; background-color: #d4edda; }
          .test-result.failed { border-left-color: #dc3545; background-color: #f8d7da; }
          .test-name { font-weight: bold; font-size: 1.1em; margin-bottom: 8px; }
          .test-details { font-size: 0.9em; color: #666; margin: 4px 0; }
          .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 0.8em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusIcon} Website Monitor Report</h1>
            <p>Status: ${results.overallStatus} | ${new Date(results.timestamp).toLocaleString()}</p>
            <p>Website: ${config.website.url}</p>
          </div>
          
          <div class="content">
            <h3>Test Results</h3>
            ${results.tests.map(test => `
              <div class="test-result ${test.passed ? 'passed' : 'failed'}">
                <div class="test-name">${test.passed ? '✅' : '❌'} ${test.test}</div>
                ${test.statusCode ? `<div class="test-details"><strong>Status Code:</strong> ${test.statusCode}</div>` : ''}
                ${test.responseTime ? `<div class="test-details"><strong>Response Time:</strong> ${test.responseTime}</div>` : ''}
                ${test.testedUrl ? `<div class="test-details"><strong>Tested URL:</strong> ${test.testedUrl}</div>` : ''}
                <div class="test-details"><strong>Details:</strong> ${test.details}</div>
                ${test.error ? `<div class="test-details" style="color: #721c24;"><strong>Error:</strong> ${test.error}</div>` : ''}
              </div>
            `).join('')}
          </div>
          
          <div class="footer">
            Generated by Website Monitor on ${new Date().toLocaleString()}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  start() {
    console.log('🚀 Website Monitor starting up...');
    console.log(`📅 Schedule: ${config.monitoring.schedule}`);
    console.log(`🌐 Monitoring: ${config.website.url}`);
    console.log(`📧 Email recipients: ${config.email.recipients.length}`);

    // Validate configuration
    if (!config.website.url || !config.website.loginUrl) {
      console.error('❌ Missing required website configuration');
      process.exit(1);
    }

    // Run initial test
    this.runMonitoringCycle().catch(error => {
      console.error('Initial monitoring cycle failed:', error);
    });

    // Schedule recurring tests
    cron.schedule(config.monitoring.schedule, () => {
      this.runMonitoringCycle().catch(error => {
        console.error('Scheduled monitoring cycle failed:', error);
      });
    });

    console.log('✅ Website Monitor is running');
  }
}

// Start the monitor if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new WebsiteMonitor();
  monitor.start();
}

export default WebsiteMonitor;