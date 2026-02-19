const axios = require('axios');
require('dotenv').config();

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    
    this.baseUrl = this.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    
    console.log('=== M-PESA SERVICE INITIALIZED ===');
    console.log('Environment:', this.environment);
    console.log('Base URL:', this.baseUrl);
    console.log('Shortcode:', this.shortcode);
    console.log('Callback URL:', this.callbackUrl);
  }

  async getAccessToken() {
    try {
      console.log('\n=== GETTING ACCESS TOKEN ===');
      console.log('Consumer Key exists:', !!this.consumerKey);
      console.log('Consumer Secret exists:', !!this.consumerSecret);
      console.log('Base URL:', this.baseUrl);
      
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      console.log('Auth string created');
      
      const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
      console.log('Requesting token from:', url);
      
      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      
      console.log('Access token received successfully');
      return response.data.access_token;
    } catch (error) {
      console.error('=== ACCESS TOKEN ERROR ===');
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to get M-Pesa access token');
    }
  }

  async initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
    try {
      console.log('\n=== STK PUSH INITIATED ===');
      console.log('Phone Number:', phoneNumber);
      console.log('Amount:', amount);
      console.log('Account Reference:', accountReference);
      console.log('Transaction Description:', transactionDesc);
      
      console.log('\nStep 1: Getting access token...');
      const accessToken = await this.getAccessToken();
      console.log('Access token received:', accessToken ? 'YES' : 'NO');
      
      console.log('\nStep 2: Generating timestamp and password...');
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);
      console.log('Timestamp:', timestamp);
      console.log('Password generated');

      console.log('\nStep 3: Formatting phone number...');
      // Format phone number (remove + and ensure it starts with 254)
      let formattedPhone = phoneNumber.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('254')) {
        formattedPhone = formattedPhone;
      } else if (formattedPhone.startsWith('+254')) {
        formattedPhone = formattedPhone.substring(1);
      }
      console.log('Original phone:', phoneNumber);
      console.log('Formatted phone:', formattedPhone);

      console.log('\nStep 4: Building request body...');
      const requestBody = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.ceil(amount),
        PartyA: formattedPhone,
        PartyB: this.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc || 'Payment for goods',
      };
      
      console.log('Request Body:');
      console.log(JSON.stringify(requestBody, null, 2));

      const stkPushUrl = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
      console.log('\nStep 5: Sending STK Push request to:', stkPushUrl);

      const response = await axios.post(stkPushUrl, requestBody, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      });

      console.log('\n=== M-PESA RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Response Data:');
      console.log(JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error) {
      console.error('\n=== STK PUSH ERROR ===');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error('No response received');
        console.error('Request timeout or network error');
      } else {
        console.error('Error:', error.message);
      }
      throw new Error(error.response?.data?.errorMessage || 'Failed to initiate M-Pesa payment');
    }
  }

  generatePassword(timestamp) {
    const data = this.shortcode + this.passkey + timestamp;
    return Buffer.from(data).toString('base64');
  }

  getTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }
}

module.exports = new MpesaService();