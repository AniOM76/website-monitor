# Website Monitor for Railway

A robust, automated website monitoring system that runs continuously on Railway, testing your website every 4 hours and sending detailed email reports to your team.

## ✨ Features

- **🔍 Comprehensive Testing**: Connectivity, login functionality, and authenticated access
- **📧 Email Reports**: Beautiful HTML and text email notifications
- **⏰ Flexible Scheduling**: Customizable monitoring intervals using cron syntax
- **🚀 Railway Optimized**: Designed specifically for Railway's platform
- **🛡️ Error Handling**: Automatic error notifications and recovery
- **📊 Detailed Logging**: Console logs for monitoring and debugging

## 🚀 Quick Setup

### 1. Fork/Clone Repository

```bash
git clone <your-repo-url>
cd website-monitor
```

### 2. Test Locally (Optional)

```bash
npm install
cp .env.example .env
# Fill in your configuration in .env
npm test  # Run a single test
npm start # Start continuous monitoring
```

### 3. Deploy to Railway

#### Option A: Railway CLI
```bash
npm install -g @railway/cli
railway login
railway link
railway up
```

#### Option B: GitHub Integration (Recommended)
1. Push your code to GitHub
2. Go to [Railway](https://railway.app)
3. Click "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect it's a Node.js app and deploy

### 4. Configure Environment Variables in Railway

In your Railway dashboard:
1. Go to your project
2. Click on "Variables" tab
3. Add all variables from `.env.example`:

```
WEBSITE_URL=https://your-website.com
LOGIN_URL=https://your-website.com/login
USERNAME=your-username
PASSWORD=your-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
RECIPIENT_EMAILS=coworker1@company.com,coworker2@company.com
CRON_SCHEDULE=0 */4 * * *
```

### 5. Redeploy

After adding environment variables, redeploy by:
- Pushing a new commit to GitHub (auto-deploy), or
- Using `railway up` with CLI

## 📧 Email Setup Guide

### Gmail Setup (Recommended)
1. Enable 2-factor authentication on your Google account
2. Go to [Google Account Settings > Security > App Passwords](https://myaccount.google.com/apppasswords)
3. Generate an app password for "Mail"
4. Use this app password as `EMAIL_PASS` (not your regular password)

### Other Email Providers
- **Outlook**: `smtp-mail.outlook.com:587`
- **SendGrid**: `smtp.sendgrid.net:587` (API key as password)
- **Mailgun**: `smtp.mailgun.org:587`

## ⚙️ Configuration Options

### Monitoring Schedule
Modify `CRON_SCHEDULE` using cron syntax:
- Every 4 hours: `0 */4 * * *` (default)
- Every 2 hours: `0 */2 * * *`
- Every hour: `0 * * * *`
- Every 30 minutes: `*/30 * * * *`
- Daily at 9 AM: `0 9 * * *`

### Request Timeout
Set `REQUEST_TIMEOUT` in milliseconds (default: 10000 = 10 seconds)

## 🏗️ Project Structure

```
website-monitor/
├── monitor.js           # Main monitoring application
├── test.js             # Manual test script
├── package.json        # Dependencies and scripts
├── Dockerfile          # Optional Docker configuration
├── .env.example        # Environment variables template
└── README.md           # This file
```

## 🧪 Testing

### Manual Test
```bash
npm test
```

This runs a single monitoring cycle and shows detailed results.

### Continuous Monitoring
```bash
npm start
```

Starts the full monitoring system with scheduled checks.

## 📊 Monitoring Reports

The monitor sends two types of emails:

### 1. Regular Reports (Every 4 hours)
- **Subject**: `Website Monitor Report - PASS/FAIL - Date`
- **Content**: Detailed test results with response times
- **Format**: Both HTML (styled) and plain text

### 2. Error Notifications
- **Subject**: `🚨 Website Monitor System Error`
- **Content**: System error details and timestamp
- **Trigger**: When the monitoring system itself fails

## 🔧 Customization

### Modify Tests
Edit the test methods in `monitor.js`:
- `testConnectivity()` - Basic website accessibility
- `testLogin()` - Login form submission
- `testAuthenticatedAccess()` - Protected page access

### Custom Login Forms
If your login form uses different field names, modify the login test:
```javascript
const loginData = new URLSearchParams({
  email: config.website.username,    // Change 'username' to 'email'
  passwd: config.website.password,   // Change 'password' to 'passwd'
  csrf_token: csrfToken              // Add CSRF token if needed
});
```

### Protected URLs
Modify the protected URLs list in `testAuthenticatedAccess()`:
```javascript
const protectedUrls = [
  `${config.website.url}/admin`,      // Your admin page
  `${config.website.url}/settings`,   // Settings page
  // Add more URLs as needed
];
```

## 🐛 Troubleshooting

### Common Issues

**1. Login Test Always Fails**
- Check if form field names are correct (`username`/`email`, `password`/`passwd`)
- Verify login URL is the form submission endpoint
- Check if CSRF tokens are required

**2. Email Not Sending**
- Verify SMTP credentials and server settings
- Ensure app passwords are used (not regular passwords)
- Check Railway logs for email errors

**3. App Keeps Restarting**
- Check Railway logs for errors
- Verify all required environment variables are set
- Ensure website URLs are accessible

### Railway-Specific Tips

**View Logs**:
```bash
railway logs
```

**Check Environment**:
```bash
railway variables
```

**Local Development**:
```bash
railway run npm start  # Run with Railway environment
```

## 📈 Monitoring the Monitor

### Railway Dashboard
- View deployment status and logs
- Monitor resource usage
- Check environment variables

### Email Confirmations
- Regular reports confirm the system is working
- Error notifications alert you to issues
- No emails = potential system problem

### Health Checks
The app includes console logging for monitoring:
- `🚀 Website Monitor starting up...` - Startup confirmation
- `🔍 Starting monitoring cycle...` - Each test cycle
- `✅ Monitoring cycle completed` - Successful completion
- `❌ Monitoring cycle failed` - Error occurred

## 💰 Railway Pricing

- **Hobby Plan**: $5/month (recommended for this use case)
- **Free Tier**: Available but limited (may work for basic monitoring)
- **Usage-Based**: Pay only for what you use

This monitor uses minimal resources and should cost very little to run.

## 🆘 Support

### Railway Issues
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)

### Monitor Issues
- Check logs with `railway logs`
- Test locally with `npm test`
- Verify environment variable configuration

### Email Issues
- Test SMTP settings with online tools
- Check email provider documentation
- Verify firewall/network restrictions

---

**Ready to deploy?** Push to GitHub and connect to Railway for automatic deployment!