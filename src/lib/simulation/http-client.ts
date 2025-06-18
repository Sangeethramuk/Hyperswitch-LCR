// HTTP client functions replacing Python requests library
import axios, { AxiosResponse, AxiosError } from 'axios';
import { PaymentPayload, DecideGatewayPayload, DECIDE_GATEWAY_HEADERS } from './types';

export class SimulationHttpClient {
  private apiKey: string;
  private profileId: string;

  constructor(apiKey: string, profileId: string) {
    this.apiKey = apiKey;
    this.profileId = profileId;
  }

  // Equivalent to Python's requests.post for payments API
  async makePaymentRequest(url: string, payload: PaymentPayload): Promise<any> {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'api-key': this.apiKey,
      'x-feature': 'router-custom'
    };

    try {
      const response: AxiosResponse = await axios.post(url, payload, {
        headers,
        timeout: 30000
      });
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          // HTTP error response
          throw new Error(`HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data).substring(0, 200)}`);
        } else if (axiosError.request) {
          // Request timeout or network error
          throw new Error(`Request failed: ${axiosError.message}`);
        }
      }
      throw new Error(`Unexpected error: ${error}`);
    }
  }

  // Equivalent to Python's requests.post for decide-gateway API
  async makeDecideGatewayRequest(url: string, payload: DecideGatewayPayload): Promise<any> {
    try {
      const response: AxiosResponse = await axios.post(url, payload, {
        headers: DECIDE_GATEWAY_HEADERS,
        timeout: 30000
      });
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          throw new Error(`DG HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data).substring(0, 200)}`);
        } else if (axiosError.request) {
          throw new Error(`DG Request failed: ${axiosError.message}`);
        }
      }
      throw new Error(`DG Unexpected error: ${error}`);
    }
  }

  // Equivalent to Python's requests.get for business profile
  async fetchBusinessProfile(merchantId: string): Promise<any> {
    const url = `https://sandbox.hyperswitch.io/account/${merchantId}/business_profile/${this.profileId}`;
    const headers = {
      'api-key': this.apiKey,
      'Content-Type': 'application/json'
    };

    try {
      const response: AxiosResponse = await axios.get(url, {
        headers,
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          throw new Error(`Business profile HTTP ${axiosError.response.status}: ${axiosError.response.data}`);
        } else if (axiosError.request) {
          throw new Error(`Business profile request failed: ${axiosError.message}`);
        }
      }
      throw new Error(`Business profile unexpected error: ${error}`);
    }
  }
}

// Utility function to simulate Python's time.sleep()
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Utility function to get current timestamp (equivalent to Python's datetime.now().isoformat())
export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

// Utility function to generate UUID (equivalent to Python's uuid.uuid4())
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Utility function for random integer (equivalent to Python's random.randint())
export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Utility function for random choice (equivalent to Python's random.choice())
export const randomChoice = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

// Utility function to shuffle array (equivalent to Python's random.shuffle())
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
