// test.js - Test the monitoring system manually
import WebsiteMonitor from './monitor.js';

console.log('🧪 Running Website Monitor Test');
console.log('================================');

// Load environment variables from .env if available
try {
  const { config } = await import('dotenv');
  config();
} catch (error) {
  console.log('No dotenv package found, using environment variables directly');
}

const monitor = new WebsiteMonitor();

// Run a single monitoring cycle
try {
  const results = await monitor.runMonitoringCycle();
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`Overall Status: ${results.overallStatus}`);
  console.log(`Tests Run: ${results.tests.length}`);
  console.log(`Passed: ${results.tests.filter(t => t.passed).length}`);
  console.log(`Failed: ${results.tests.filter(t => !t.passed).length}`);
  
  console.log('\n📝 Detailed Results:');
  results.tests.forEach(test => {
    console.log(`\n${test.test}: ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (test.details) console.log(`  Details: ${test.details}`);
    if (test.error) console.log(`  Error: ${test.error}`);
    if (test.responseTime) console.log(`  Response Time: ${test.responseTime}`);
  });
  
  console.log('\n✅ Test completed successfully');
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}