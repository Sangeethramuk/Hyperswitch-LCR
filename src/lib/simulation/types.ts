// TypeScript interfaces matching Python data structures from pseudocode.py

export interface SimulationParams {
  apiKey: string;
  profileId: string;
  merchantId: string;
  numberOfBatches: number;
  batchSize: number;
  inputDebitPercent: number;
  inputCoBadgedPercent: number;
  inputRegulatedPercent: number;
  minAmount: number;
  maxAmount: number;
}

export interface CardInfo {
  number: string;
  label: string;
  payment_type: 'debit' | 'credit';
  exp_month?: string;
  base_min?: number;
  base_max?: number;
  amount_range: [number, number];
}

export interface PaymentPayload {
  amount: number;
  currency: string;
  confirm: boolean;
  capture_method: string;
  profile_id: string;
  customer_id: string;
  email: string;
  name: string;
  phone: string;
  phone_country_code: string;
  description: string;
  authentication_type: string;
  return_url: string;
  payment_method: string;
  payment_method_type: string;
  payment_method_data: {
    card: {
      card_number: string;
      card_exp_month: string;
      card_exp_year: string;
      card_holder_name: string;
      card_cvc: string;
    };
  };
  billing: {
    address: {
      line1: string;
      line2: string;
      line3: string;
      city: string;
      state: string;
      zip: string;
      country: string;
      first_name: string;
      last_name: string;
    };
    phone: {
      number: string;
      country_code: string;
    };
    email: string;
  };
  browser_info: {
    user_agent: string;
    accept_header: string;
    language: string;
    color_depth: number;
    screen_height: number;
    screen_width: number;
    time_zone: number;
    java_enabled: boolean;
    java_script_enabled: boolean;
    ip_address: string;
  };
  metadata: {
    udf1: string;
    simulation_type: string;
  };
}

export interface DecideGatewayPayload {
  merchantId: string;
  eligibleGatewayList: string[];
  rankingAlgorithm: string;
  eliminationEnabled: boolean;
  paymentInfo: {
    paymentId: string;
    amount: number;
    currency: string;
    customerId: string;
    udfs: null;
    preferredGateway: null;
    paymentType: string;
    metadata: string;
    internalMetadata: null;
    isEmi: boolean;
    emiBank: null;
    emiTenure: null;
    paymentMethodType: string;
    paymentMethod: string;
    paymentSource: null;
    authType: null;
    cardIssuerBankName: null;
    cardIsin: string;
    cardType: null;
    cardSwitchProvider: null;
  };
}

export interface TransactionData {
  run_id: string;
  batch_id: number;
  transaction_timestamp: string;
  payment_id: string;
  amount: number;
  card_network: string;
  card_isin: string;
  status: string;
  label: string;
  payment_type: string;
  co_badged_card_networks: string;
  is_eligible_for_debit_routing: string;
  saving_percentage: number;
  is_debit_routed: string;
  is_regulated?: boolean | string;
}

export interface BatchResult {
  data: TransactionData[];
  savings: number;
  processed_dg_eligible: number;
  processed_all: number;
}

export interface SSEEvent {
  type: string;
  content: any;
}

export interface StructuredTransactionLogEntry {
  transactionNumber: number;
  cardType: string;
  amount: number;
  isDebitRouted: string;
  leastCostNetwork: string;
  savingsPercentage: number;
  coBadgedNetworks: string;
  status: string;
  paymentNetwork: string;
  formattedOutput: string;
}

export interface ChartUpdateContent {
  transactionDistribution: Record<string, number>;
  dailySavings: {
    regulated: number;
    unregulated: number;
  };
  dailyVolume: {
    regulated: number;
    unregulated: number;
  };
  savingsByNetwork: Record<string, number>;
}

export interface SummaryContent {
  overall_savings_percentage: number;
  total_processed_amount: number;
  total_debit_routed_transactions: number;
}

// Constants from Python file
export const CSV_HEADERS = [
  "run_id", "batch_id", "transaction_timestamp", "payment_id", "amount", 
  "card_network", "card_isin", "status", "label", "payment_type", 
  "co_badged_card_networks", "is_eligible_for_debit_routing", "saving_percentage", 
  "is_debit_routed", "is_regulated"
];

export const REGULATED_DEBIT_ROUTED_CARDS_BASE: Omit<CardInfo, 'amount_range'>[] = [
  { number: "4400002000000004", label: "Regulated Debit", payment_type: "debit" }
];

export const UNREGULATED_DEBIT_ROUTED_CARDS_BASE: Omit<CardInfo, 'amount_range'>[] = [
  { number: "4000033003300335", label: "Unregulated Debit (Special)", base_min: 12, payment_type: "debit" },
  { number: "5002510000000013", label: "Unregulated Debit", payment_type: "debit" }
];

export const GLOBAL_NETWORK_CHEAPER_CARDS_BASE: Omit<CardInfo, 'amount_range'>[] = [
  { number: "4000033003300335", label: "Global Cheaper (Special)", base_max: 10, payment_type: "debit" }
];

export const NOT_CO_BADGED_CARDS_BASE: Omit<CardInfo, 'amount_range'>[] = [
  { number: "4111112014267661", label: "Not Co-badged Debit", exp_month: "12", payment_type: "debit" }
];

export const CREDIT_CARDS_BASE: Omit<CardInfo, 'amount_range'>[] = [
  { number: "5555555555554444", label: "Credit", exp_month: "03", payment_type: "credit" }
];

// API URLs
export const PAYMENTS_API_URL = 'https://sandbox.hyperswitch.io/payments';
export const DECIDE_GATEWAY_API_URL = 'https://sandbox.juspay.in/decide-gateway';

// Default values
export const DEFAULT_API_KEY = "snd_PCRrfXrM4NIMSsjdqiygoPLlCePqpQNedBTkWsNAyAb8SzWNphZ4mRkmiukaPs5H";
export const DEFAULT_PROFILE_ID = "pro_iM60uEdIuclhxMNy5mNy";
export const DEFAULT_NO_OF_BATCHES = 20;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_INPUT_DEBIT_PERCENT = 90;
export const DEFAULT_CO_BADGED_PERCENT = 80;
export const DEFAULT_REGULATED_PERCENT = 50;
export const DEFAULT_MIN_AMOUNT = 1;
export const DEFAULT_MAX_AMOUNT = 1000;

export const INITIAL_DELAY_SEC = 0;
export const INTER_PAYMENT_SLEEP_SEC = 0.5;

export const DECIDE_GATEWAY_HEADERS = {
  "Content-Type": "application/json",
  "x-merchantid": "hyperswitchTest"
};
