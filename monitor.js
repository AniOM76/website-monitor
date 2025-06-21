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
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    alertOnlyFailures: process.env.SLACK_FAILURES_ONLY === 'true' // Only send alerts for failures
  },
  monitoring: {
    schedule: process.env.CRON_SCHEDULE || '0 */4 * * *',
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000')
  }
};

class WebsiteMonitor {
  constructor() {
    console.log('📝 Website Monitor initialized with logging output');
  }

  async runMonitoringCycle() {
    console.log(`🔍 Starting monitoring cycle at ${new Date().toISOString()}`);
    
    try {
      const results = await this.runAllTests();
      this.logResults(results);
      await this.sendSlackNotification(results);
      
      console.log(`✅ Monitoring cycle completed. Status: ${results.overallStatus}`);
      return results;
    } catch (error) {
      console.error('❌ Monitoring cycle failed:', error);
      this.logError(error);
      await this.sendSlackErrorNotification(error);
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
        
        // Test 4: Logout to clean up session
        console.log('Cleaning up session...');
        const logoutTest = await this.testLogout(loginTest.sessionCookie);
        results.tests.push(logoutTest);
      } else {
        results.tests.push({
          test: 'Authenticated Access',
          passed: false,
          details: 'Skipped due to login failure'
        });
        results.tests.push({
          test: 'Session Cleanup',
          passed: false,
          details: 'Skipped due to login failure'
        });
      }

      // Determine overall status
      const criticalTests = results.tests.filter(test => 
        test.test !== 'Session Cleanup' // Don't fail overall status for cleanup issues
      );
      results.overallStatus = criticalTests.every(test => test.passed) ? 'PASS' : 'FAIL';
      
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

  async testLogout(sessionCookie) {
    try {
      const logoutUrl = 'https://app.snapnotes.ai/logout'; // Direct logout URL
      
      const response = await fetch(logoutUrl, {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'User-Agent': 'Website-Monitor/1.0'
        }
      });

      return {
        test: 'Session Cleanup',
        passed: true, // Don't fail monitoring if logout fails
        statusCode: response.status,
        details: response.ok ? 'Session logged out successfully' : 'Logout attempted (session may timeout naturally)'
      };
    } catch (error) {
      return {
        test: 'Session Cleanup',
        passed: true, // Don't fail monitoring if logout fails
        details: 'Logout attempted - session will timeout naturally'
      };
    }
  }

  async sendSlackNotification(results) {
    if (!config.slack.webhookUrl) {
      console.log('Slack not configured, skipping notification');
      return;
    }

    // If configured to only alert on failures, skip successful results
    if (config.slack.alertOnlyFailures && results.overallStatus === 'PASS') {
      console.log('All tests passed, skipping Slack notification (failures-only mode)');
      return;
    }

    try {
      const color = results.overallStatus === 'PASS' ? '#36a64f' : '#ff0000';
      const emoji = results.overallStatus === 'PASS' ? '✅' : '🚨';
      
      const message = {
        username: 'Website Monitor',
        icon_emoji: ':computer:',
        attachments: [{
          color: color,
          title: `${emoji} SnapNotes.ai Monitor - ${results.overallStatus}`,
          text: `Website monitoring completed at ${new Date(results.timestamp).toLocaleString()}`,
          fields: [
            {
              title: 'Website',
              value: config.website.url,
              short: true
            },
            {
              title: 'Status',
              value: results.overallStatus,
              short: true
            }
          ],
          footer: 'Website Monitor',
          ts: Math.floor(new Date(results.timestamp).getTime() / 1000)
        }]
      };

      // Add test results
      const testResults = results.tests.map(test => {
        const icon = test.passed ? '✅' : '❌';
        let value = `${icon} ${test.passed ? 'PASS' : 'FAIL'}`;
        
        if (test.responseTime) {
          value += ` (${test.responseTime})`;
        }
        
        if (!test.passed && test.details) {
          value += `\n${test.details}`;
        }
        
        return {
          title: test.test,
          value: value,
          short: true
        };
      });

      message.attachments[0].fields.push(...testResults);

      // Add failure details if any
      if (results.overallStatus === 'FAIL') {
        const failedTests = results.tests.filter(t => !t.passed);
        if (failedTests.length > 0) {
          message.attachments[0].text += `\n\n⚠️ ${failedTests.length} test(s) failed`;
        }
      }

      const response = await fetch(config.slack.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      });

      if (response.ok) {
        console.log('📱 Slack notification sent successfully');
      } else {
        console.error('Failed to send Slack notification:', response.status);
      }
    } catch (error) {
      console.error('Error sending Slack notification:', error.message);
    }
  }

  async sendSlackErrorNotification(error) {
    if (!config.slack.webhookUrl) {
      return;
    }

    try {
      const message = {
        username: 'Website Monitor',
        icon_emoji: ':warning:',
        attachments: [{
          color: '#ff0000',
          title: '🚨 Website Monitor System Error',
          text: `The monitoring system encountered an error at ${new Date().toLocaleString()}`,
          fields: [
            {
              title: 'Error',
              value: error.message,
              short: false
            },
            {
              title: 'Website',
              value: config.website.url || 'Unknown',
              short: true
            }
          ],
          footer: 'Website Monitor',
          ts: Math.floor(Date.now() / 1000)
        }]
      };

      await fetch(config.slack.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      });

      console.log('📱 Slack error notification sent');
    } catch (slackError) {
      console.error('Failed to send Slack error notification:', slackError.message);
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
