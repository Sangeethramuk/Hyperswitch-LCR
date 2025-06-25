// Main simulation engine - direct port from Python pseudocode.py
import { 
  SimulationParams, 
  CardInfo, 
  PaymentPayload, 
  DecideGatewayPayload, 
  TransactionData, 
  BatchResult,
  SSEEvent,
  StructuredTransactionLogEntry,
  ChartUpdateContent,
  SummaryContent,
  REGULATED_DEBIT_ROUTED_CARDS_BASE,
  UNREGULATED_DEBIT_ROUTED_CARDS_BASE,
  GLOBAL_NETWORK_CHEAPER_CARDS_BASE,
  NOT_CO_BADGED_CARDS_BASE,
  CREDIT_CARDS_BASE,
  PAYMENTS_API_URL,
  DECIDE_GATEWAY_API_URL,
  INTER_PAYMENT_SLEEP_SEC
} from './types';
import { SimulationHttpClient, sleep, getCurrentTimestamp, generateUUID, randomInt, randomChoice, shuffleArray } from './http-client';
import { CSVGenerator } from './csv-generator';

export class PaymentSimulationEngine {
  private params: SimulationParams;
  private httpClient: SimulationHttpClient;
  private csvGenerator: CSVGenerator;
  private currentTransactionNumber: number = 0;
  private globalRunId: string;
  private decideGatewayProfileIdToUse: string = '';
  
  // Aggregation variables for real-time charts (equivalent to Python global vars)
  private networkTransactionCounts: Record<string, number> = {};
  private regulatedSuccessfulCount: number = 0;
  private unregulatedSuccessfulCount: number = 0;
  private regulatedTotalSavings: number = 0;
  private unregulatedTotalSavings: number = 0;
  private networkTotalSavings: Record<string, number> = {};
  
  // Global counters for summary stats
  private globalTotalProcessedAmount: number = 0;
  private globalTotalSavings: number = 0;
  private globalDebitRoutedCount: number = 0;

  constructor(params: SimulationParams) {
    this.params = params;
    this.httpClient = new SimulationHttpClient(params.apiKey, params.profileId);
    this.csvGenerator = new CSVGenerator();
    this.globalRunId = generateUUID();
  }

  // Equivalent to Python's generate_payment_payload function
  private generatePaymentPayload(cardNumber: string, amount: number, paymentType: 'debit' | 'credit' = 'debit', expMonth?: string): PaymentPayload {
    const cardExpMonth = expMonth || '03';
    const payload: PaymentPayload = {
      amount,
      currency: 'USD',
      confirm: true,
      capture_method: 'automatic',
      profile_id: this.params.profileId,
      customer_id: `cus_sim_${Math.floor(Date.now() / 1000)}_${randomInt(1000, 9999)}`,
      email: 'guest@example.com',
      name: 'pklllll',
      phone: '999999999',
      phone_country_code: '+1',
      description: 'Payment Simulation',
      authentication_type: 'no_three_ds',
      return_url: 'https://duck.com',
      payment_method: 'card',
      payment_method_type: paymentType,
      payment_method_data: {
        card: {
          card_number: cardNumber,
          card_exp_month: cardExpMonth,
          card_exp_year: '30',
          card_holder_name: 'joseph Doe',
          card_cvc: '737'
        }
      },
      billing: {
        address: {
          line1: '1467',
          line2: 'Harrison Street',
          line3: 'Harrison Street',
          city: 'San Fransico',
          state: 'California',
          zip: '94122',
          country: 'US',
          first_name: 'joseph',
          last_name: 'Doe'
        },
        phone: {
          number: '8056594427',
          country_code: '+91'
        },
        email: 'example@example.com'
      },
      browser_info: {
        user_agent: 'Mozilla/5.0',
        accept_header: 'text/html',
        language: 'en-US',
        color_depth: 24,
        screen_height: 1080,
        screen_width: 1920,
        time_zone: 0,
        java_enabled: true,
        java_script_enabled: true,
        ip_address: '127.0.0.1'
      },
      metadata: {
        udf1: 'value1',
        simulation_type: 'generic_simulation'
      }
    };

    if (paymentType === 'debit') {
      payload.description = 'Debit Routing Simulation';
      payload.metadata.simulation_type = 'debit_routing';
    } else if (paymentType === 'credit') {
      payload.description = 'Credit Card Simulation';
      payload.metadata.simulation_type = 'credit_card';
    }

    return payload;
  }

  // Equivalent to Python's generate_decide_gateway_payload function
  private generateDecideGatewayPayload(paymentId: string, amountDollars: number, cardIsin: string): DecideGatewayPayload {
    return {
      merchantId: this.decideGatewayProfileIdToUse,
      eligibleGatewayList: [paymentId],
      rankingAlgorithm: 'NTW_BASED_ROUTING',
      eliminationEnabled: true,
      paymentInfo: {
        paymentId,
        amount: amountDollars,
        currency: 'USD',
        customerId: 'CUST12345',
        udfs: null,
        preferredGateway: null,
        paymentType: 'MOTO_PAYMENT',
        metadata: JSON.stringify({
          merchant_category_code: 'merchant_category_code_0001',
          acquirer_country: 'US'
        }),
        internalMetadata: null,
        isEmi: false,
        emiBank: null,
        emiTenure: null,
        paymentMethodType: 'CARD',
        paymentMethod: 'null',
        paymentSource: null,
        authType: null,
        cardIssuerBankName: null,
        cardIsin,
        cardType: null,
        cardSwitchProvider: null
      }
    };
  }

  // Equivalent to Python's get_run_specific_cards function
  private getRunSpecificCards(inputMinAmt: number, inputMaxAmt: number): [CardInfo[], CardInfo[], CardInfo[], CardInfo[], CardInfo[]] {
    const processCardList = (baseList: any[], specialLogic?: (card: any, minIn: number, maxIn: number) => [number, number]): CardInfo[] => {
      const processedList: CardInfo[] = [];
      for (const baseCardDef of baseList) {
        const card = { ...baseCardDef };
        let minR: number, maxR: number;
        
        if (specialLogic) {
          [minR, maxR] = specialLogic(card, inputMinAmt, inputMaxAmt);
        } else {
          minR = inputMinAmt;
          maxR = inputMaxAmt;
        }
        
        if (minR <= maxR) {
          (card as CardInfo).amount_range = [minR, maxR];
          processedList.push(card as CardInfo);
        }
      }
      return processedList;
    };

    const unregulatedSpecialLogic = (card: any, minIn: number, maxIn: number): [number, number] => {
      if (card.number === '4000033003300335') {
        return [Math.max(card.base_min || 12, minIn), maxIn];
      }
      return [minIn, maxIn];
    };

    const globalCheaperSpecialLogic = (card: any, minIn: number, maxIn: number): [number, number] => {
      if (card.number === '4000033003300335') {
        return [minIn, Math.min(card.base_max || 10, maxIn)];
      }
      return [minIn, maxIn];
    };

    const runRegulatedCards = processCardList(REGULATED_DEBIT_ROUTED_CARDS_BASE);
    const runUnregulatedCards = processCardList(UNREGULATED_DEBIT_ROUTED_CARDS_BASE, unregulatedSpecialLogic);
    const runGlobalNetworkCheaperCards = processCardList(GLOBAL_NETWORK_CHEAPER_CARDS_BASE, globalCheaperSpecialLogic);
    const runNotCoBadgedCards = processCardList(NOT_CO_BADGED_CARDS_BASE);
    const runCreditCards = processCardList(CREDIT_CARDS_BASE);

    return [runRegulatedCards, runUnregulatedCards, runGlobalNetworkCheaperCards, runNotCoBadgedCards, runCreditCards];
  }

  // Emit SSE event (equivalent to Python's print statements)
  private emitSSEEvent(type: string, content: any): void {
    const eventData: SSEEvent = { type, content };
    console.log(`event: ${type}\ndata: ${JSON.stringify(eventData)}\n\n`);
    // Store the event to be yielded by the generator
    if (this.eventCallback) {
      this.eventCallback(eventData);
    }
  }

  // Callback for emitting events
  private eventCallback?: (event: SSEEvent) => void;

  // Equivalent to Python's run_batch function
  private async runBatch(batchId: number, transactionsForThisBatch: CardInfo[]): Promise<BatchResult> {
    const batchSimulationData: TransactionData[] = [];
    let batchTotalSavings = 0;
    let batchTotalProcessedDgEligible = 0;
    let batchTotalProcessedAll = 0;

    for (let i = 0; i < transactionsForThisBatch.length; i++) {
      const cardInfo = transactionsForThisBatch[i];
      const transactionTimestamp = getCurrentTimestamp();
      const cardNumber = cardInfo.number;
      const label = cardInfo.label;
      const [minAmt, maxAmt] = cardInfo.amount_range;
      
      if (minAmt > maxAmt) {
        this.emitSSEEvent('warning', {
          message: `BATCH ${batchId}, TXN IDX ${i + 1}: SKIPPING due to invalid range (${minAmt} > ${maxAmt}) for card: ${cardInfo.label}`
        });
        continue;
      }

      const amount = randomInt(minAmt, maxAmt);
      const paymentType = cardInfo.payment_type;
      const payload = this.generatePaymentPayload(cardNumber, amount, paymentType, cardInfo.exp_month);

      const txnData: TransactionData = {
        run_id: this.globalRunId,
        batch_id: batchId,
        transaction_timestamp: transactionTimestamp,
        payment_id: 'N/A',
        amount,
        card_network: 'N/A',
        card_isin: 'N/A',
        status: 'FAILED_PRE_REQUEST',
        label,
        payment_type: paymentType,
        co_badged_card_networks: 'N/A',
        is_eligible_for_debit_routing: 'No',
        saving_percentage: 0,
        is_debit_routed: 'N/A'
      };

      try {
        // Make payment request
        const resp1Json = await this.httpClient.makePaymentRequest(PAYMENTS_API_URL, payload);
        
        txnData.payment_id = resp1Json.payment_id || 'N/A';
        txnData.status = resp1Json.status || 'UNKNOWN';
        txnData.card_network = resp1Json.payment_method_data?.card?.card_network || 'N/A';
        if (txnData.card_network === 'N/A') {
          const cardNetworks = ['Visa', 'Mastercard', 'Amex', 'Discover'];
          txnData.card_network = cardNetworks[Math.floor(Math.random() * cardNetworks.length)];
        }
        txnData.card_isin = resp1Json.payment_method_data?.card?.card_isin || 'N/A';

        const hsReturnedAmountDollars = resp1Json.amount || amount;
        if (txnData.status === 'succeeded') {
          batchTotalProcessedAll += hsReturnedAmountDollars;
        }

        // Process debit routing if applicable
        if (paymentType === 'debit' && ['succeeded', 'requires_capture'].includes(txnData.status) && txnData.payment_id !== 'N/A') {
          try {
            const decidePayload = this.generateDecideGatewayPayload(txnData.payment_id, hsReturnedAmountDollars, txnData.card_isin);
            const resp2Json = await this.httpClient.makeDecideGatewayRequest(DECIDE_GATEWAY_API_URL, decidePayload);
            
            const debitOutput = resp2Json.debit_routing_output || {};
            const isRegulated = debitOutput.is_regulated;
            const networksInfo = debitOutput.co_badged_card_networks_info || [];
            const networks = networksInfo.map((n: { network: any; }) => n.network);
            const savingsPct = (networksInfo.length > 0 && networksInfo[0].saving_percentage) ? networksInfo[0].saving_percentage : 0;

            txnData.co_badged_card_networks = networks.length > 0 ? networks.join(', ') : 'N/A';
            if (txnData.co_badged_card_networks !== 'N/A') {
              txnData.is_eligible_for_debit_routing = 'Yes';
            }

            const firstNetwork = networks.length > 0 ? networks[0] : 'N/A';
            const debitNetworksSet = new Set(['ACCEL', 'STAR', 'PULSE', 'NYCE']);
            txnData.is_debit_routed = debitNetworksSet.has(firstNetwork.toUpperCase()) ? 'Yes' : 'No';
            txnData.is_regulated = isRegulated;

            if (txnData.status === 'succeeded') {
              txnData.saving_percentage = savingsPct;
              const currentSaving = (savingsPct / 100) * hsReturnedAmountDollars;
              batchTotalSavings += currentSaving;

              // Update real-time aggregation variables
              const network = txnData.card_network;
              if (network && network !== 'N/A') {
                this.networkTransactionCounts[network] = (this.networkTransactionCounts[network] || 0) + 1;
              }

              if (txnData.status === 'succeeded') {
                if (txnData.is_regulated === true) {
                  this.regulatedSuccessfulCount += 1;
                } else {
                  this.unregulatedSuccessfulCount += 1;
                }
              }

              if (txnData.is_debit_routed === 'Yes' && txnData.status === 'succeeded' && currentSaving > 0) {
                if (txnData.is_regulated === true) {
                  this.regulatedTotalSavings += currentSaving;
                } else {
                  this.unregulatedTotalSavings += currentSaving;
                }
                this.networkTotalSavings[network] = (this.networkTotalSavings[network] || 0) + currentSaving;
              }

              // Update global summary counters
              if (txnData.status === 'succeeded') {
                this.globalTotalProcessedAmount += hsReturnedAmountDollars;
                this.globalTotalSavings += currentSaving;
                if (txnData.is_debit_routed === 'Yes') {
                  this.globalDebitRoutedCount += 1;
                }
              }

              if (txnData.is_eligible_for_debit_routing === 'Yes') {
                batchTotalProcessedDgEligible += hsReturnedAmountDollars;
              }
            }
          } catch (dgError) {
            this.emitSSEEvent('warning', {
              message: `Batch ${batchId}, Txn ${i + 1} (${label}): DG API call failed. Error: ${dgError}`
            });
          }
        }

      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('HTTP')) {
            txnData.status = `FAILED_HS_HTTP_${error.message}`;
          } else {
            txnData.status = 'FAILED_HS_REQUEST_EXCEPTION';
          }
        } else {
          txnData.status = 'FAILED_HS_UNEXPECTED_ERROR';
        }
        this.emitSSEEvent('error', {
          message: `Batch ${batchId}, Txn ${i + 1} (${label}): HS API Error. ${error}`
        });
      }

      // Ensure fields are set for non-debit transactions
      if (paymentType !== 'debit' || label === 'Not Co-badged Debit') {
        txnData.is_eligible_for_debit_routing = 'No';
        txnData.is_debit_routed = 'No';
        if (!('is_regulated' in txnData)) {
          txnData.is_regulated = 'N/A';
        }
      }

      if (txnData.status !== 'succeeded') {
        txnData.saving_percentage = 0;
      }

      batchSimulationData.push(txnData);

      this.currentTransactionNumber += 1;
      const logTxnNum = this.currentTransactionNumber;

      // Generate transaction details for SSE
      const cardTypeDisplay = this.getCardTypeDisplay(txnData);
      const lcnLog = this.getLeastCostNetwork(txnData);

      const transactionDetails: StructuredTransactionLogEntry = {
        transactionNumber: logTxnNum,
        cardType: cardTypeDisplay,
        amount: txnData.amount,
        isDebitRouted: txnData.is_debit_routed,
        leastCostNetwork: lcnLog,
        savingsPercentage: txnData.saving_percentage,
        coBadgedNetworks: txnData.co_badged_card_networks,
        status: txnData.status,
        paymentNetwork: txnData.card_network,
        formattedOutput: this.generateFormattedOutput(logTxnNum, cardTypeDisplay, txnData, lcnLog)
      };

      this.emitSSEEvent('transaction_details', transactionDetails);

      // Send chart updates
      this.sendChartUpdate();
      this.sendSummaryUpdate();

      // Sleep between transactions
      if (INTER_PAYMENT_SLEEP_SEC > 0) {
        await sleep(INTER_PAYMENT_SLEEP_SEC * 1000);
      }
    }

    return {
      data: batchSimulationData,
      savings: batchTotalSavings,
      processed_dg_eligible: batchTotalProcessedDgEligible,
      processed_all: batchTotalProcessedAll
    };
  }

  // Helper methods
  private getCardTypeDisplay(txnData: TransactionData): string {
    const label = txnData.label || 'Unknown Card';
    if (txnData.payment_type === 'credit') return 'Credit';
    if (label === 'Not Co-badged Debit') return 'Single Network Debit';
    if (label === 'Regulated Debit') return 'Regulated Debit';
    if (label.includes('Unregulated Debit')) return 'Unregulated Debit';
    if (label.includes('Global Cheaper')) return 'Co-badged Debit (Global Network)';
    return label;
  }

  private getLeastCostNetwork(txnData: TransactionData): string {
    if (txnData.co_badged_card_networks && txnData.co_badged_card_networks !== 'N/A') {
      return txnData.co_badged_card_networks.split(',')[0].trim();
    }
    return 'N/A';
  }

  private generateFormattedOutput(txnNum: number, cardType: string, txnData: TransactionData, lcn: string): string {
    return `
╔════════════════════════════════════════════════════════════════════════╗
║ Transaction #${txnNum.toString().padStart(3, '0')}: ${cardType.padEnd(56)} ║
║ Amount: $${txnData.amount.toFixed(2).padEnd(10)} Status: ${txnData.status.padEnd(36)} ║
║ Payment Network: ${(txnData.card_network || 'N/A').padEnd(20)} ║
║ Savings: ${txnData.saving_percentage.toFixed(2)}% ║
║ Debit Routed: ${txnData.is_debit_routed.padEnd(5)} LCN: ${lcn.padEnd(10)} ║
║ Co-badged Networks: ${(txnData.co_badged_card_networks || 'N/A').padEnd(50)} ║
╚════════════════════════════════════════════════════════════════════════╝`;
  }

  private sendChartUpdate(): void {
    const chartData: ChartUpdateContent = {
      transactionDistribution: this.networkTransactionCounts,
      dailySavings: {
        regulated: Math.round(this.regulatedTotalSavings * 100) / 100,
        unregulated: Math.round(this.unregulatedTotalSavings * 100) / 100
      },
      dailyVolume: {
        regulated: this.regulatedSuccessfulCount,
        unregulated: this.unregulatedSuccessfulCount
      },
      savingsByNetwork: this.networkTotalSavings
    };
      this.emitSSEEvent('chart_update', chartData);
  }

  private sendSummaryUpdate(): void {
    const currentGlobalSavingsPercentage = this.globalTotalProcessedAmount > 0 
      ? (this.globalTotalSavings / this.globalTotalProcessedAmount * 100) 
      : 0;

    const summary: SummaryContent = {
      overall_savings_percentage: Math.round(currentGlobalSavingsPercentage * 100) / 100,
      total_processed_amount: Math.round(this.globalTotalProcessedAmount * 100) / 100,
      total_debit_routed_transactions: this.globalDebitRoutedCount
    };
      this.emitSSEEvent('summary', summary);
  }

  // Main simulation function (equivalent to Python's simulate_debit_routing)
  async runSimulation(eventCallback: (event: SSEEvent) => void): Promise<void> {
    this.eventCallback = eventCallback;
    try {
      // Fetch business profile to determine decide-gateway profile ID
      let isDebitRoutingGloballyEnabled = false;
      
      try {
        const businessProfileData = await this.httpClient.fetchBusinessProfile(this.params.merchantId);
        isDebitRoutingGloballyEnabled = businessProfileData.is_debit_routing_enabled || false;
        this.emitSSEEvent('info', { 
          message: `Business profile fetched. is_debit_routing_enabled: ${isDebitRoutingGloballyEnabled}` 
        });
      } catch (error) {
        this.emitSSEEvent('error', { 
          message: `Error fetching business profile: ${error}. Defaulting is_debit_routing_enabled to False.` 
        });
      }

      if (isDebitRoutingGloballyEnabled) {
        this.decideGatewayProfileIdToUse = this.params.profileId;
        this.emitSSEEvent('info', { 
          message: `Debit routing is ENABLED globally. Using profile_id ${this.params.profileId} for decide-gateway calls.` 
        });
      } else {
        this.decideGatewayProfileIdToUse = 'ifashbbfkbhalfl';
        this.emitSSEEvent('info', { 
          message: 'Debit routing is DISABLED globally or profile fetch failed. Using profile_id "ifashbbfkbhalfl" for decide-gateway calls.' 
        });
      }

      const totalTransactions = this.params.numberOfBatches * this.params.batchSize;
      this.emitSSEEvent('info', { 
        message: `Starting Simulation with ${totalTransactions} transactions (${this.params.numberOfBatches} batches of ${this.params.batchSize})... (Global Run ID: ${this.globalRunId})` 
      });

      // Validate parameters
      if (totalTransactions <= 0) {
        throw new Error(`TOTAL_TRANSACTIONS must be positive. Received: ${totalTransactions}`);
      }

      // Get card lists for this run
      const [runRegulatedCards, runUnregulatedCards, runGlobalNetworkCheaperCards, runNotCoBadgedCards, runCreditCards] =
        this.getRunSpecificCards(this.params.minAmount, this.params.maxAmount);

      // Calculate transaction distribution
      const overallNumTotalDebitTxns = Math.round(totalTransactions * (this.params.inputDebitPercent / 100));
      const overallNumCreditTxns = totalTransactions - overallNumTotalDebitTxns;
      const overallNumCoBadgedOfDebit = Math.round(overallNumTotalDebitTxns * (this.params.inputCoBadgedPercent / 100));
      const overallNumNotCoBadgedDebit = overallNumTotalDebitTxns - overallNumCoBadgedOfDebit;
      const overallNumRegulatedDebitRouted = Math.round(overallNumCoBadgedOfDebit * (this.params.inputRegulatedPercent / 100));
      const overallRemainingCoBadged = overallNumCoBadgedOfDebit - overallNumRegulatedDebitRouted;

      let overallNumGlobalNetworkCheaper = 0;
      if (runGlobalNetworkCheaperCards.length > 0) {
        const gncPerc = randomInt(10, 20) / 100;
        overallNumGlobalNetworkCheaper = Math.round(overallRemainingCoBadged * gncPerc);
      }
      const overallNumUnregulatedDebitRouted = overallRemainingCoBadged - overallNumGlobalNetworkCheaper;

      // Create all cards to simulate
      const allCardsToSimulateGlobally: CardInfo[] = [];

      // Populate cards based on distribution
      const addCards = (cardList: CardInfo[], count: number) => {
        for (let i = 0; i < count; i++) {
          if (cardList.length > 0) {
            allCardsToSimulateGlobally.push(randomChoice(cardList));
          }
        }
      };

      addCards(runCreditCards, overallNumCreditTxns);
      addCards(runNotCoBadgedCards, overallNumNotCoBadgedDebit);
      addCards(runRegulatedCards, overallNumRegulatedDebitRouted);
      addCards(runGlobalNetworkCheaperCards, overallNumGlobalNetworkCheaper);
      addCards(runUnregulatedCards, overallNumUnregulatedDebitRouted);

      // Shuffle the cards
      const shuffledCards = shuffleArray(allCardsToSimulateGlobally);

      // Run batches in parallel
      const batchPromises: Promise<BatchResult>[] = [];
      for (let i = 0; i < this.params.numberOfBatches; i++) {
        const startIndex = i * this.params.batchSize;
        const endIndex = startIndex + this.params.batchSize;
        const transactionsForThisBatch = shuffledCards.slice(startIndex, endIndex);
        
        if (transactionsForThisBatch.length > 0) {
          batchPromises.push(this.runBatch(i + 1, transactionsForThisBatch));
        }
      }

      // Wait for all batches to complete
      const batchResults = await Promise.all(batchPromises);

      // Aggregate results
      const allSimulationData: TransactionData[] = [];
      let totalSavingsAllBatches = 0;
      let totalProcessedAllTypesAllBatches = 0;

      for (const result of batchResults) {
        allSimulationData.push(...result.data);
        totalSavingsAllBatches += result.savings;
        totalProcessedAllTypesAllBatches += result.processed_all;
      }

      // Generate final summary
      const overallSavingsPercentage = totalProcessedAllTypesAllBatches > 0 
        ? (totalSavingsAllBatches / totalProcessedAllTypesAllBatches * 100) 
        : 0;

      const totalDebitRoutedCount = allSimulationData.filter(txn => txn.is_debit_routed === 'Yes').length;

      this.emitSSEEvent('info', { message: '========================================' });
      this.emitSSEEvent('info', { message: `📊 OVERALL SIMULATION SUMMARY REPORT (Global Run ID: ${this.globalRunId}) 📊` });
      this.emitSSEEvent('info', { message: '========================================' });
      this.emitSSEEvent('info', { message: `💰 Total Savings (as % of Total Processed Amount): ${overallSavingsPercentage.toFixed(2)}%` });
      this.emitSSEEvent('info', { message: `💲 Total Amount Processed (All Successful Txns): $${totalProcessedAllTypesAllBatches.toFixed(2)} USD` });
      this.emitSSEEvent('info', { message: `📈 Total Debit Routed Transactions: ${totalDebitRoutedCount}` });

      // Instead, emit results in-memory:
      this.emitSSEEvent('simulation_results', { data: allSimulationData });

      // Final summary
      const finalSummary: SummaryContent = {
        overall_savings_percentage: Math.round(overallSavingsPercentage * 100) / 100,
        total_processed_amount: Math.round(totalProcessedAllTypesAllBatches * 100) / 100,
        total_debit_routed_transactions: totalDebitRoutedCount
      };
      this.emitSSEEvent('summary', finalSummary);

    } catch (error) {
      this.emitSSEEvent('error', { message: `Simulation error: ${error}` });
      throw error;
    }
  }
}
