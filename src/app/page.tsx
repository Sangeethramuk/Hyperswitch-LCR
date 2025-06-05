"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog'; // Added DialogDescription, DialogClose
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, MerchantConnector, TransactionLogEntry, AISummaryInput, AISummaryOutput, TimeSeriesDataPoint } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow';
import { MiniSidebar } from '@/components/MiniSidebar';
import { groupLogs } from '@/lib/utils';

const LOCALSTORAGE_API_KEY = 'hyperswitch_apiKey';
const LOCALSTORAGE_PROFILE_ID = 'hyperswitch_profileId';
const LOCALSTORAGE_MERCHANT_ID = 'hyperswitch_merchantId';

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);
  const [overallSuccessRateHistory, setOverallSuccessRateHistory] = useState<OverallSRHistory>([]);

  const [isApiCredentialsModalOpen, setIsApiCredentialsModalOpen] = useState<boolean>(false); // Initial state is false
  const [apiKey, setApiKey] = useState<string>('');
  const [profileId, setProfileId] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');

  const [merchantConnectors, setMerchantConnectors] = useState<MerchantConnector[]>([]);
  const [connectorToggleStates, setConnectorToggleStates] = useState<Record<string, boolean>>({});
  const [isLoadingMerchantConnectors, setIsLoadingMerchantConnectors] = useState<boolean>(false);

  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>({});
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });

  const [transactionLogs, setTransactionLogs] = useState<TransactionLogEntry[]>([]);
  const transactionCounterRef = useRef<number>(0);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null); 

  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summaryAttempted, setSummaryAttempted] = useState<boolean>(false);
  const [simulationCsvFileName, setSimulationCsvFileName] = useState<string | null>(null);
  const [overallSavingsPercentage, setOverallSavingsPercentage] = useState<number>(0);
  const [totalProcessedAmount, setTotalProcessedAmount] = useState<number>(0);
  const [totalDebitRoutedTransactions, setTotalDebitRoutedTransactions] = useState<number>(0);
  const [lastSimulationTimestamp, setLastSimulationTimestamp] = useState<number | null>(null);
  const [transactionDistributionData, setTransactionDistributionData] = useState<Array<{ name: string; value: number }>>([]);

  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const parentTab = 'least-cost-routing';
  const [contentTab, setContentTab] = useState<'stats' | 'analytics'>('stats');

  const { mutate: initiatePythonSimulation, isPending: isPythonSimulationPending } = useMutation<ReadableStream<Uint8Array>, Error, any>({
    mutationFn: async (params: any) => {
      streamControllerRef.current = new AbortController();
      const response = await fetch('/api/run-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: streamControllerRef.current.signal,
      });
      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ error: "Failed to initiate simulation stream." }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return response.body;
    },
    onSuccess: (streamBody) => {
      setSimulationState('running'); 
      toast({ title: "Simulation Stream Started", description: "Receiving logs..." });
      processStreamedLogs(streamBody);
    },
    onError: (error: Error) => {
      setSimulationState('idle');
      toast({ title: "Simulation Initiation Error", description: error.message, variant: "destructive" });
    },
  });
  
  console.log("[HomePage Render] isPythonSimulationPending:", isPythonSimulationPending, "simulationState:", simulationState, "isApiCredentialsModalOpen:", isApiCredentialsModalOpen);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem(LOCALSTORAGE_API_KEY);
      const storedProfileId = localStorage.getItem(LOCALSTORAGE_PROFILE_ID);
      const storedMerchantId = localStorage.getItem(LOCALSTORAGE_MERCHANT_ID);

      let allCredsFound = true;
      if (storedApiKey) setApiKey(storedApiKey); else allCredsFound = false;
      if (storedProfileId) setProfileId(storedProfileId); else allCredsFound = false;
      if (storedMerchantId) setMerchantId(storedMerchantId); else allCredsFound = false;

      if (allCredsFound && storedApiKey && storedProfileId && storedMerchantId) {
        setIsApiCredentialsModalOpen(false);
        console.log("[useEffect] All credentials found in localStorage, fetching connectors.");
        fetchMerchantConnectors(storedMerchantId, storedApiKey);
      } else {
        console.log("[useEffect] Some credentials missing from localStorage, opening modal.");
        setIsApiCredentialsModalOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => { setContentTab('stats'); }, [parentTab]);

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(prev => ({ ...(prev || {} as FormValues), ...data }));
  }, []);

  const fetchMerchantConnectors = useCallback(async (currentMerchantId: string, currentApiKey: string): Promise<MerchantConnector[]> => {
    console.log('[fetchMerchantConnectors] Called with merchantId:', currentMerchantId, 'apiKey present?', !!currentApiKey, 'profileId from state:', profileId);
    if (!currentMerchantId || !currentApiKey || !profileId) { 
      toast({ title: "Credentials Missing", description: "Cannot fetch connectors. Profile ID, Merchant ID, or API Key is missing.", variant: "destructive" });
      return [];
    }
    setIsLoadingMerchantConnectors(true);
    try {
      const response = await fetch(`https://sandbox.hyperswitch.io/account/${currentMerchantId}/profile/connectors`, {
        method: 'GET', headers: { 'api-key': currentApiKey, 'x-profile-id': profileId }, 
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch connectors"}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const connectorsData: MerchantConnector[] = await response.json();
      console.log('[fetchMerchantConnectors] Connectors data received:', connectorsData);
      setMerchantConnectors(connectorsData || []);
      
      const initialToggleStates: Record<string, boolean> = {};
      (connectorsData || []).forEach((connector) => {
        const key = connector.merchant_connector_id || connector.connector_name;
        if (key) initialToggleStates[key] = !(connector.disabled === true);
      });
      setConnectorToggleStates(initialToggleStates);

      setCurrentControls(prev => {
        const base = prev && Object.keys(prev.processorWiseSuccessRates || {}).length > 0 ? { ...prev } : {
          totalPayments: 1000, numberOfBatches: 100, batchSize: 10,
          selectedPaymentMethods: [...PAYMENT_METHODS], processorMatrix: {},
          processorIncidents: {}, overallSuccessRate: 0, processorWiseSuccessRates: {},
          structuredRule: null, minAggregatesSize: 5, maxAggregatesSize: 10,
          isSuccessBasedRoutingEnabled: true, explorationPercent: 20,
          debitTransactionsPercent: 0, eligibleTransactionPercent: 0, regulatedIssuerTransactionPercent: 0,
          minAmount: 0, maxAmount: 10000, connectorWiseFailurePercentage: {},
        } as FormValues;
        const newPwsr = { ...base.processorWiseSuccessRates };
        (connectorsData || []).forEach(c => {
            const key = c.merchant_connector_id || c.connector_name;
            if (!newPwsr[key]) newPwsr[key] = { sr: 0, srDeviation: 0, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
        });
        console.log('[fetchMerchantConnectors] Setting currentControls.');
        return { ...base, processorWiseSuccessRates: newPwsr };
      });
      toast({ title: "Success", description: "Merchant connectors fetched." });
      return connectorsData || [];
    } catch (error: any) {
      console.error('[fetchMerchantConnectors] Error:', error);
      toast({ title: "Fetch Connectors Error", description: error.message, variant: "destructive" });
      setMerchantConnectors([]); setConnectorToggleStates({});
      return [];
    } finally {
      setIsLoadingMerchantConnectors(false);
    }
  }, [profileId, toast]);

  const handleConnectorToggleChange = async (connectorId: string, newState: boolean) => {
    const originalState = connectorToggleStates[connectorId];
    setConnectorToggleStates(prev => ({ ...prev, [connectorId]: newState }));
    if (!merchantId || !apiKey) {
      toast({ title: "API Credentials Missing", description: "Cannot update connector status.", variant: "destructive" });
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState }));
      return;
    }
    const connectorToUpdate = merchantConnectors.find(c => (c.merchant_connector_id || c.connector_name) === connectorId);
    const connectorTypeForAPI = connectorToUpdate?.connector_type || "payment_processor"; 
    try {
      const response = await fetch(`https://sandbox.hyperswitch.io/account/${merchantId}/connectors/${connectorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({ connector_type: connectorTypeForAPI, disabled: !newState }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update." }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      toast({ title: "Connector Status Updated", description: `Connector ${connectorId} ${newState ? 'enabled' : 'disabled'}.` });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState }));
    }
  };

  const handleApiCredentialsSubmit = () => {
    console.log('[handleApiCredentialsSubmit] Called. States from input: apiKey?', !!apiKey, 'profileId?', !!profileId, 'merchantId?', !!merchantId);
    if (!apiKey || !profileId || !merchantId) {
      toast({ title: "API Credentials Required", description: "Please enter all API credentials in the modal.", variant: "destructive" }); return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_API_KEY, apiKey);
      localStorage.setItem(LOCALSTORAGE_PROFILE_ID, profileId);
      localStorage.setItem(LOCALSTORAGE_MERCHANT_ID, merchantId);
      console.log('[handleApiCredentialsSubmit] Credentials saved to localStorage.');
    }
    setIsApiCredentialsModalOpen(false);
    console.log('[handleApiCredentialsSubmit] Modal closed. Fetching connectors with merchantId:', merchantId, 'apiKey:', apiKey);
    fetchMerchantConnectors(merchantId, apiKey);
  };
  
  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    setSuccessRateHistory([]); setVolumeHistory([]); setOverallSuccessRateHistory([]);
    accumulatedProcessorStatsRef.current = {};
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };
    setTransactionLogs([]); transactionCounterRef.current = 0;
    setSummaryAttempted(false); setSimulationCsvFileName(null);
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel('Simulation reset by user').catch(e => console.warn("Error cancelling previous stream reader:", e));
      streamReaderRef.current = null;
    }
    if (streamControllerRef.current) {
      streamControllerRef.current.abort('Simulation reset by user');
      streamControllerRef.current = null;
    }
  };

  const processStreamedLogs = async (streamBody: ReadableStream<Uint8Array>) => {
    const reader = streamBody.pipeThrough(new TextDecoderStream()).getReader();
    streamReaderRef.current = reader;
    let sseBuffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          setLastSimulationTimestamp(Date.now());
          console.log("Stream finished.");
          processCsvForDistribution();
          break;
        }
        sseBuffer += value;
        let eolIndex;
        while ((eolIndex = sseBuffer.indexOf('\n\n')) >= 0) {
          const message = sseBuffer.substring(0, eolIndex);
          sseBuffer = sseBuffer.substring(eolIndex + 2);
          if (message.startsWith('data: ')) {
            console.log('SSE message:', message);
            try {
              const jsonData = JSON.parse(message.substring(6));
              handleSseEvent(jsonData);
            } catch (e) { console.error("Error parsing SSE message:", message, e); }
          }
        }
      }
    } catch (error: any) {
        console.error("Error reading stream:", error);
        if (error.name !== 'AbortError') {
            toast({ title: "Stream Error", description: error.message, variant: "destructive" });
        }
        setSimulationState('idle');
    } finally {
        streamReaderRef.current = null;
    }
  };

  const handleSseEvent = (eventData: {type: string, content: any}) => {
    console.log('handleSseEvent', eventData);
    transactionCounterRef.current += 1;
    const baseLog: Partial<TransactionLogEntry> = { 
        transactionNumber: Number(transactionCounterRef.current), 
        timestamp: Date.now(), 
        connector: 'Python Script',
        routingApproach: 'N/A',
    };
    let logEntry: TransactionLogEntry;

    switch(eventData.type) {
      case 'log':
        logEntry = { ...baseLog, status: 'info', rawLog: String(eventData.content) } as TransactionLogEntry;
        const newLogEntry: TransactionLogEntry = {
          transactionNumber: Number(transactionCounterRef.current),
          timestamp: Date.now(),
          connector: 'Python Script',
          routingApproach: 'N/A',
          status: 'info',
          rawLog: String(eventData.content),
        };
        setTransactionLogs(prev => {
          const lastLog = prev[0];
          if (lastLog && lastLog.rawLog !== undefined && lastLog.rawLog.includes('--------------------') && newLogEntry.rawLog !== undefined && newLogEntry.rawLog.includes('--------------------')) {
            return [{ ...baseLog, status: 'info', rawLog: lastLog.rawLog + '\n' + newLogEntry.rawLog } as TransactionLogEntry, ...prev.slice(1)];
          } else {
            return [newLogEntry, ...prev];
          }
        });
        break;
      case 'error_log':
        logEntry = { ...baseLog, status: 'error', rawLog: String(eventData.content) } as TransactionLogEntry;
        setTransactionLogs(prev => [logEntry, ...prev]);
        break;
      case 'script_error':
        logEntry = { ...baseLog, status: 'error', rawLog: `SCRIPT ERROR: ${eventData.content}` } as TransactionLogEntry;
        setTransactionLogs(prev => [logEntry, ...prev]);
        setSimulationState('idle');
        break;
      case 'script_exit':
        const exitMessage = `Script exited with code ${eventData.content.code}.`;
        logEntry = { ...baseLog, status: eventData.content.code === 0 ? 'info' : 'error', rawLog: exitMessage } as TransactionLogEntry;
        setTransactionLogs(prev => [logEntry, ...prev]);
        break;
      case 'csv_ready':
        logEntry = { ...baseLog, status: 'info', rawLog: `CSV file '${eventData.content.fileName}' is ready.` } as TransactionLogEntry;
        setTransactionLogs(prev => [logEntry, ...prev]);
        setSimulationCsvFileName(eventData.content.fileName);
        break;
      case 'summary':
        console.log("Received summary data:", eventData.content);
        setOverallSavingsPercentage(eventData.content.overall_savings_percentage);
        setTotalProcessedAmount(eventData.content.total_processed_amount);
        setTotalDebitRoutedTransactions(eventData.content.total_debit_routed_transactions ?? 0);
        break;
      default:
        console.warn("Unknown SSE event type:", eventData.type);
    }
  };

  const handleStartSimulation = useCallback(async (forceStart = false) => {
    console.log('[handleStartSimulation] Called. forceStart:', forceStart, 'simulationState:', simulationState);
    console.log('[handleStartSimulation] Credentials check from state: apiKey?', !!apiKey, 'profileId?', !!profileId, 'merchantId?', !!merchantId);
    if (!apiKey || !profileId || !merchantId) {
      console.log('[handleStartSimulation] Credentials missing from state, opening modal.');
      setIsApiCredentialsModalOpen(true); return;
    }
    console.log('[handleStartSimulation] merchantConnectors.length:', merchantConnectors.length);
    if (merchantConnectors.length === 0 && !forceStart) {
        console.log('[handleStartSimulation] No connectors in state, fetching merchant connectors...');
        const connectors = await fetchMerchantConnectors(merchantId, apiKey); 
        if (connectors.length === 0) {
             console.log('[handleStartSimulation] No connectors found after fetch, aborting.');
             toast({ title: "Error", description: "No merchant connectors found. Cannot start simulation.", variant: "destructive" });
             return;
        }
        console.log('[handleStartSimulation] Connectors fetched.');
    }
    
    console.log('[handleStartSimulation] currentControls before check:', currentControls);
    if (!currentControls) {
      console.log('[handleStartSimulation] currentControls is null, aborting. This might happen if fetchMerchantConnectors did not run or complete successfully.');
      toast({ title: "Config Error", description: "Simulation controls not initialized. Please ensure API credentials are correct and connectors are loaded.", variant: "destructive" }); return;
    }

    console.log('[handleStartSimulation] Current simulationState before reset/run:', simulationState);
    if (simulationState === 'idle' || forceStart) {
      console.log('[handleStartSimulation] Resetting simulation state.');
      resetSimulationState();
    }
    
    setSimulationState('running'); 
    toast({ title: "Python Simulation Initiating...", description: "Connecting to backend..." });
    
    initiatePythonSimulation({
      apiKey, profileId, merchantId,
      numberOfBatches: currentControls.numberOfBatches,
      batchSize: currentControls.batchSize,
      inputDebitPercent: currentControls.debitTransactionsPercent,
      inputCoBadgedPercent: currentControls.eligibleTransactionPercent,
      inputRegulatedPercent: currentControls.regulatedIssuerTransactionPercent,
      minAmount: currentControls.minAmount,
      maxAmount: currentControls.maxAmount,
    });
  }, [currentControls, apiKey, profileId, merchantId, simulationState, initiatePythonSimulation, merchantConnectors, toast, fetchMerchantConnectors]);

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running') {
      toast({ title: "Pause Not Supported", description: "Streaming simulation cannot be paused once started." });
    }
  }, [simulationState, toast]);

  const handleStopSimulation = useCallback(() => {
    if (simulationState === 'running') {
      if (streamControllerRef.current) {
        streamControllerRef.current.abort('User stopped simulation'); 
        toast({ title: "Simulation Stopping..."});
      }
    } else { 
      setSimulationState('idle');
      toast({ title: "Simulation Stopped (UI)"});
    }
  }, [simulationState, toast]);

  const executeAiSummary = useCallback(async () => { /* ... original ... */ }, [currentControls, processedPaymentsCount, transactionLogs, overallSuccessRateHistory, toast, accumulatedGlobalStatsRef, accumulatedProcessorStatsRef, setIsSummaryModalOpen, setIsSummarizing, setSummaryText]);
  const handleRequestAiSummary = useCallback(() => { /* ... original ... */ }, [currentControls, transactionLogs, toast, setSummaryAttempted, executeAiSummary]);
  useEffect(() => { /* ... original (for JS sim completion, review if needed for Python SSE) ... */ }, [simulationState, processedPaymentsCount, currentControls, transactionLogs, handleRequestAiSummary, summaryAttempted]);

  const processCsvForDistribution = useCallback(async () => {
    console.log("Processing CSV for transaction distribution...");
    try {
      const response = await fetch('/debit_routing_simulation_results.csv');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const csvText = await response.text();
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(header => header.trim());
      const networkIndex = headers.indexOf('card_network');

      if (networkIndex === -1) {
        console.error("Missing required 'card_network' column in CSV for distribution.");
        setTransactionDistributionData([]);
        return;
      }

      const networkCountMap: { [key: string]: number } = {};

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(value => value.trim()); // Use regex for robust split
        const network = values[networkIndex];

        if (network && network !== 'N/A') { // Exclude empty or N/A networks
          networkCountMap[network] = (networkCountMap[network] || 0) + 1;
        }
      }

      const distributionData = Object.keys(networkCountMap).map(network => ({
        name: network,
        value: networkCountMap[network],
      })).sort((a, b) => b.value - a.value); // Sort by value descending

      console.log("Transaction Distribution Data:", distributionData);
      setTransactionDistributionData(distributionData);

    } catch (error) {
      console.error("Error processing CSV for distribution:", error);
      setTransactionDistributionData([]);
    }
  }, []);

  return (
    <>
      <AppLayout>
        <div className={'theme-least-cost'}>
          <Header
            activeTab={parentTab}
            onTabChange={() => {}}
            onStartSimulation={handleStartSimulation}
            onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation}
            simulationState={simulationState}
            isPending={isPythonSimulationPending} 
          />
          <div className={`flex flex-row flex-grow overflow-hidden`} style={{ height: 'calc(100vh - 64px)' }}>
            <MiniSidebar activeSection={activeSection} onSectionChange={(section) => { setActiveSection(section); setSidebarCollapsed(false); }} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />
            {!sidebarCollapsed && (
              <div className="flex flex-col min-h-screen h-auto overflow-y-auto">
                <BottomControlsPanel onFormChange={handleControlsChange} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} onConnectorToggleChange={handleConnectorToggleChange} apiKey={apiKey} profileId={profileId} merchantId={merchantId} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} activeTab={activeSection} parentTab={parentTab} />
              </div>
            )}
            <div className="flex flex-col flex-1 h-full min-h-0">
              {parentTab !== 'least-cost-routing' ? (
                <Tabs value={contentTab} onValueChange={tab => setContentTab(tab as 'stats' | 'analytics')} className="flex flex-col h-full">
                  <div className="flex items-center justify-start p-4 pb-0"><TabsList><TabsTrigger value="stats">Stats</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList></div>
                  <TabsContent value="stats" className="flex-1 h-full"><ScrollArea className="h-full"><div className="p-6"><StatsView currentControls={currentControls} merchantConnectors={merchantConnectors} processedPayments={processedPaymentsCount} totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful} totalFailed={accumulatedGlobalStatsRef.current.totalFailed} overallSuccessRateHistory={overallSuccessRateHistory} parentTab={parentTab} successRateHistory={successRateHistory} volumeHistory={volumeHistory} connectorToggleStates={connectorToggleStates} overallSavingsPercentage={overallSavingsPercentage} totalProcessedAmount={totalProcessedAmount} totalDebitRoutedTransactions={totalDebitRoutedTransactions} simulationRunId={lastSimulationTimestamp} transactionDistributionData={transactionDistributionData} /></div></ScrollArea></TabsContent>
                  <TabsContent value="analytics" className="flex-1 h-full"><ScrollArea className="h-full"><div className="p-2 md:p-4 lg:p-6"><div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm p-6 mb-6"><AnalyticsGraphsView successRateHistory={successRateHistory} volumeHistory={volumeHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} /></div></div></ScrollArea></TabsContent>
                </Tabs>
              ) : (
                <div className="flex flex-col h-full"><ScrollArea className="h-full"><div className="p-6"><StatsView currentControls={currentControls} merchantConnectors={merchantConnectors} processedPayments={processedPaymentsCount} totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful} totalFailed={accumulatedGlobalStatsRef.current.totalFailed} overallSuccessRateHistory={overallSuccessRateHistory} parentTab={parentTab} successRateHistory={successRateHistory} volumeHistory={volumeHistory} connectorToggleStates={connectorToggleStates} overallSavingsPercentage={overallSavingsPercentage} totalProcessedAmount={totalProcessedAmount} totalDebitRoutedTransactions={totalDebitRoutedTransactions} simulationRunId={lastSimulationTimestamp} transactionDistributionData={transactionDistributionData} /></div></ScrollArea></div>
              )}
            </div>
            <div className="flex flex-col h-full min-h-0 border-l p-2 md:p-4 lg:p-6 w-[400px] min-w-[300px]">
              <h2 className="text-lg font-semibold mb-2 flex-shrink-0">Transaction Logs</h2>
              {simulationCsvFileName && (
                <div className="mb-2">
                  <Button onClick={() => {
                    window.open(`/api/download-csv?fileName=${encodeURIComponent(simulationCsvFileName)}`, '_blank');
                  }}>Download Simulation CSV</Button>
                </div>
              )}
              <div className="flex-grow min-h-0">
                <ScrollArea className="h-full">
                  {transactionLogs.length > 0 ? (
                    groupLogs(transactionLogs).map((logGroup, index) => (
                      <div key={`group-${index}`} className="text-sm p-3 mb-2 border rounded-md font-mono break-all bg-card">
                        {logGroup.map((log, logIndex) => (
                          <div key={`${log.timestamp}-${logIndex}`} className="mb-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm">Log Entry #{log.transactionNumber}</span>
                              <span className="text-gray-500 dark:text-gray-400">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                              </span>
                            </div>
                            {log.rawLog ? (
                              <pre className="whitespace-pre-wrap">{log.rawLog}</pre>
                            ) : (
                              <>
                                <div><span className="font-semibold">Processor:</span> {log.connector}</div>
                                <div><span className="font-semibold">Status:</span> {log.status}</div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Log entries will appear here...</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
      <Dialog open={isApiCredentialsModalOpen} onOpenChange={setIsApiCredentialsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>API Credentials</DialogTitle>
            <DialogDescription>
              Enter your Hyperswitch API Key, Profile ID, and Merchant ID. These will be stored in localStorage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiKey" className="text-right">API Key</Label>
              <Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="col-span-3" placeholder="Enter API Key" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="profileId" className="text-right">Profile ID</Label>
              <Input id="profileId" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="col-span-3" placeholder="Enter Profile ID" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="merchantId" className="text-right">Merchant ID</Label>
              <Input id="merchantId" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} className="col-span-3" placeholder="Enter Merchant ID" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleApiCredentialsSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>{/* ... original DialogContent ... */}</Dialog>
    </>
  );
}
