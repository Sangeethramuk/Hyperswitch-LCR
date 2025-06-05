import requests
import random
import json
import time
import csv
import sys
import argparse
import uuid # For unique run ID
from datetime import datetime # For transaction timestamp
import os # To check if CSV exists
import copy # For deep copying card lists
import threading # For parallelization

# --- ANSI Color Codes ---
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
BLUE = '\033[94m'
CYAN = '\033[96m'
RESET = '\033[0m'

if not sys.stdout.isatty():
    GREEN = YELLOW = RED = BLUE = CYAN = RESET = ""

DEFAULT_API_KEY = "snd_PCRrfXrM4NIMSsjdqiygoPLlCePqpQNedBTkWsNAyAb8SzWNphZ4mRkmiukaPs5H"
DEFAULT_PROFILE_ID = "pro_iM60uEdIuclhxMNy5mNy"
DEFAULT_NO_OF_BATCHES = 20 # Reduced from 1 (or 100 via args) to 20
DEFAULT_BATCH_SIZE = 50  # Adjusted to keep 1000 total with 20 batches
DEFAULT_INPUT_DEBIT_PERCENT = 90 
DEFAULT_CO_BADGED_PERCENT = 80 
DEFAULT_REGULATED_PERCENT = 50 
DEFAULT_MIN_AMOUNT = 1
DEFAULT_MAX_AMOUNT = 1000

INITIAL_DELAY_SEC = 0 
INTER_PAYMENT_SLEEP_SEC = 0.5 # Increased from 0.1 to 0.5
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..')) # Assuming script is in project_root/src/app
CSV_FILENAME = os.path.join(PROJECT_ROOT, 'public', 'debit_routing_simulation_results.csv')
PAYMENTS_API_URL = 'https://sandbox.hyperswitch.io/payments'
DECIDE_GATEWAY_API_URL = 'https://sandbox.juspay.in/decide-gateway'
DECIDE_MERCHANT_ID = DEFAULT_PROFILE_ID

API_KEY = ""
PROFILE_ID = ""
NO_OF_BATCHES = 0
BATCH_SIZE = 0
INPUT_DEBIT_PERCENT = 0
INPUT_CO_BADGED_PERCENT = 0
INPUT_REGULATED_PERCENT = 0
INPUT_MIN_AMOUNT = 0
INPUT_MAX_AMOUNT = 0

DECIDE_GATEWAY_HEADERS = {
    "Content-Type": "application/json",
    "x-merchantid": "hyperswitchTest"
}

REGULATED_DEBIT_ROUTED_CARDS_BASE = [{"number": "4400002000000004", "label": "Regulated Debit", "payment_type": "debit"}]
UNREGULATED_DEBIT_ROUTED_CARDS_BASE = [
    {"number": "4000033003300335", "label": "Unregulated Debit (Special)", "base_min": 12, "payment_type": "debit"},
    {"number": "5002510000000013", "label": "Unregulated Debit", "payment_type": "debit"}
]
GLOBAL_NETWORK_CHEAPER_CARDS_BASE = [{"number": "4000033003300335", "label": "Global Cheaper (Special)", "base_max": 10, "payment_type": "debit"}]
NOT_CO_BADGED_CARDS_BASE = [{"number": "4111112014267661", "label": "Not Co-badged Debit", "exp_month": "12", "payment_type": "debit"}]
CREDIT_CARDS_BASE = [{"number": "5555555555554444", "label": "Credit", "exp_month": "03", "payment_type": "credit"}]

print_lock = threading.Lock()
transaction_counter_lock = threading.Lock()
current_transaction_number = 0
summary_lock = threading.Lock()
batch_results_aggregated = []

# --- Aggregation Variables for Real-time Charts ---
network_transaction_counts = {}
regulated_successful_count = 0
unregulated_successful_count = 0
regulated_total_savings = 0.0
unregulated_total_savings = 0.0
network_total_savings = {}
# --- End Aggregation Variables ---

# Define all possible CSV headers
CSV_HEADERS = [
    "run_id", "batch_id", "transaction_timestamp", "payment_id", "amount", 
    "card_network", "card_isin", "status", "label", "payment_type", 
    "co_badged_card_networks", "is_eligible_for_debit_routing", "saving_percentage", 
    "is_debit_routed", "is_regulated"
]

def safe_print(*args, **kwargs):
    with print_lock:
        print(*args, **kwargs)

def generate_payment_payload(card_number, amount, payment_type="debit", exp_month=None):
    card_exp_month = exp_month if exp_month else "03"
    payload = {
        "amount": amount, "currency": "USD", "confirm": True, "capture_method": "automatic",
        "profile_id": PROFILE_ID, "customer_id": f"cus_sim_{int(time.time())}_{random.randint(1000, 9999)}",
        "email": "guest@example.com", "name": "pklllll", "phone": "999999999", "phone_country_code": "+1",
        "description": "Payment Simulation", "authentication_type": "no_three_ds",
        "return_url": "https://duck.com", "payment_method": "card", "payment_method_type": payment_type,
        "payment_method_data": {
            "card": {"card_number": card_number, "card_exp_month": card_exp_month, "card_exp_year": "30", "card_holder_name": "joseph Doe", "card_cvc": "737"}
        },
        "billing": { "address": { "line1": "1467", "line2": "Harrison Street", "line3": "Harrison Street", "city": "San Fransico", "state": "California", "zip": "94122", "country": "US", "first_name": "joseph", "last_name": "Doe" }, "phone": {"number": "8056594427", "country_code": "+91"}, "email": "example@example.com" },
        "browser_info": { "user_agent": "Mozilla/5.0", "accept_header": "text/html", "language": "en-US", "color_depth": 24, "screen_height": 1080, "screen_width": 1920, "time_zone": 0, "java_enabled": True, "java_script_enabled": True, "ip_address": "127.0.0.1" },
        "metadata": {"udf1": "value1", "simulation_type": "generic_simulation"}
    }
    if payment_type == "debit":
        payload["description"] = "Debit Routing Simulation"
        payload["metadata"]["simulation_type"] = "debit_routing"
    elif payment_type == "credit":
        payload["description"] = "Credit Card Simulation"
        payload["metadata"]["simulation_type"] = "credit_card"
    return payload

def generate_decide_gateway_payload(payment_id, amount_dollars, card_isin):
    return {
        "merchantId": DECIDE_MERCHANT_ID, "eligibleGatewayList": [payment_id], "rankingAlgorithm": "NTW_BASED_ROUTING", "eliminationEnabled": True,
        "paymentInfo": { "paymentId": payment_id, "amount": amount_dollars, "currency": "USD", "customerId": "CUST12345", "udfs": None, "preferredGateway": None, "paymentType": "MOTO_PAYMENT", "metadata": json.dumps({"merchant_category_code":"merchant_category_code_0001","acquirer_country":"US"}), "internalMetadata": None, "isEmi": False, "emiBank": None, "emiTenure": None, "paymentMethodType": "CARD", "paymentMethod": "null", "paymentSource": None, "authType": None, "cardIssuerBankName": None, "cardIsin": card_isin, "cardType": None, "cardSwitchProvider": None }
    }

def write_to_csv(data_list, filename):
    safe_print(f"Attempting to write CSV to: {filename}") # Log the target filename
    if not data_list: 
        safe_print("Data list is empty. Will clear/create an empty CSV.") # Log empty data case
        try:
            with open(filename, 'w', newline='', encoding='utf-8') as output_file:
                pass 
            safe_print(f"{GREEN}✅ Successfully cleared/created empty CSV at {filename}{RESET}") # Success log for empty
        except IOError as e:
            safe_print(f"{RED}❌ Error clearing/creating CSV file {filename}: {e}{RESET}") # Detailed error log
        return

    keys = list(data_list[0].keys()) if data_list else []
    if not keys: 
        safe_print(f"{RED}Cannot write to CSV {filename}: No data keys found, though data_list was not empty.{RESET}")
        return
        
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as output_file: 
            dict_writer = csv.DictWriter(output_file, fieldnames=CSV_HEADERS)
            dict_writer.writeheader() 
            dict_writer.writerows(data_list)
        safe_print(f"{GREEN}✅ Successfully wrote {len(data_list)} rows to CSV at {filename}{RESET}") # Success log for data
    except IOError as e: safe_print(f"{RED}❌ Error writing CSV file {filename}: {e}{RESET}") # Detailed error log

def get_run_specific_cards(input_min_amt, input_max_amt):
    def _process_card_list(base_list, special_logic=None):
        processed_list = []
        for base_card_def in base_list:
            card = base_card_def.copy()
            if special_logic:
                min_r, max_r = special_logic(card, input_min_amt, input_max_amt)
            else:
                min_r, max_r = input_min_amt, input_max_amt
            if min_r <= max_r:
                card["amount_range"] = (min_r, max_r)
                processed_list.append(card)
        return processed_list

    def unregulated_special_logic(card, min_in, max_in):
        if card["number"] == "4000033003300335": return max(card.get("base_min", 12), min_in), max_in
        return min_in, max_in

    def global_cheaper_special_logic(card, min_in, max_in):
        if card["number"] == "4000033003300335": return min_in, min(card.get("base_max", 10), max_in)
        return min_in, max_in

    run_regulated_cards = _process_card_list(REGULATED_DEBIT_ROUTED_CARDS_BASE)
    run_unregulated_cards = _process_card_list(UNREGULATED_DEBIT_ROUTED_CARDS_BASE, unregulated_special_logic)
    run_global_network_cheaper_cards = _process_card_list(GLOBAL_NETWORK_CHEAPER_CARDS_BASE, global_cheaper_special_logic)
    run_not_co_badged_cards = _process_card_list(NOT_CO_BADGED_CARDS_BASE)
    run_credit_cards = _process_card_list(CREDIT_CARDS_BASE)
    return run_regulated_cards, run_unregulated_cards, run_global_network_cheaper_cards, run_not_co_badged_cards, run_credit_cards

def run_batch(batch_id, transactions_for_this_batch, global_run_id, results_list, payments_headers_arg, summary_lock):
    global current_transaction_number 
    global network_transaction_counts
    global regulated_successful_count
    global unregulated_successful_count
    global regulated_total_savings
    global unregulated_total_savings
    global network_total_savings
    
    batch_simulation_data = []
    batch_total_savings = 0.0
    batch_total_processed_dg_eligible = 0.0
    batch_total_processed_all = 0.0
    
    for i, card_info in enumerate(transactions_for_this_batch, 1):
        transaction_timestamp = datetime.now().isoformat()
        card_number = card_info["number"]; label = card_info["label"]
        min_amt, max_amt = card_info["amount_range"]
        if min_amt > max_amt: 
            safe_print(f"{RED}BATCH {batch_id}, TXN IDX {i}: SKIPPING due to invalid range ({min_amt} > {max_amt}) for card: {card_info}{RESET}")
            continue 
        amount = random.randint(min_amt, max_amt)
        payment_type = card_info.get("payment_type", "debit")
        payload = generate_payment_payload(card_number, amount, payment_type, card_info.get("exp_month"))
        txn_data = { "run_id": global_run_id, "batch_id": batch_id, "transaction_timestamp": transaction_timestamp,
                     "payment_id": "N/A", "amount": amount, "card_network": "N/A", "card_isin": "N/A", 
                     "status": "FAILED_PRE_REQUEST", "label": label, "payment_type": payment_type,
                     "co_badged_card_networks": "N/A", "is_eligible_for_debit_routing": "No", 
                     "saving_percentage": 0, "is_debit_routed": "N/A" }
        try:
            response1 = requests.post(PAYMENTS_API_URL, headers=payments_headers_arg, data=json.dumps(payload), timeout=30)
            response1.raise_for_status()
            resp1_json = response1.json()
            txn_data.update({ "payment_id": resp1_json.get("payment_id", "N/A"), "status": resp1_json.get("status", "UNKNOWN"),
                              "card_network": resp1_json.get("payment_method_data", {}).get("card", {}).get("card_network", "N/A"),
                              "card_isin": resp1_json.get("payment_method_data", {}).get("card", {}).get("card_isin", "N/A") })
            hs_returned_amount_dollars = resp1_json.get("amount", amount) 
            if txn_data["status"] == "succeeded": batch_total_processed_all += hs_returned_amount_dollars
            if payment_type == "debit" and txn_data["status"] in ["succeeded", "requires_capture"] and txn_data["payment_id"] != "N/A":
                decide_payload = generate_decide_gateway_payload(txn_data["payment_id"], hs_returned_amount_dollars, txn_data["card_isin"])
                try:
                    response2 = requests.post(DECIDE_GATEWAY_API_URL, headers=DECIDE_GATEWAY_HEADERS, data=json.dumps(decide_payload), timeout=30)
                    response2.raise_for_status()
                    resp2_json = response2.json()
                    debit_output = resp2_json.get("debit_routing_output", {})
                    is_regulated = debit_output.get("is_regulated", "N/A")
                    networks = debit_output.get("co_badged_card_networks", []); savings_pct = debit_output.get("saving_percentage", 0)
                    txn_data["co_badged_card_networks"] = ", ".join(networks) if networks else "N/A"
                    if txn_data["co_badged_card_networks"] != "N/A": txn_data["is_eligible_for_debit_routing"] = "Yes"
                    first_network = networks[0] if networks else "N/A"
                    debit_networks_set = {"ACCEL", "STAR", "PULSE", "NYCE"}
                    txn_data["is_debit_routed"] = "Yes" if first_network.upper() in debit_networks_set else "No"
                    txn_data["is_regulated"] = is_regulated
                    if txn_data["status"] == "succeeded":
                        txn_data["saving_percentage"] = savings_pct
                        current_saving = (savings_pct / 100.0) * hs_returned_amount_dollars
                        batch_total_savings += current_saving
                        
                        # Update real-time aggregation variables (thread-safe)
                        with summary_lock:
                            # Transaction Distribution Count
                            network = txn_data.get("card_network")
                            if network and network != "N/A":
                                network_transaction_counts[network] = network_transaction_counts.get(network, 0) + 1

                            # Daily Volume Count (Successful regulated/unregulated)
                            if txn_data.get("status") == "succeeded":
                                if txn_data.get("is_regulated") is True:
                                    regulated_successful_count += 1
                                else:
                                    unregulated_successful_count += 1

                            # Daily Savings and Savings by Network
                            if txn_data.get("is_debit_routed") == "Yes" and txn_data.get("status") == "succeeded" and current_saving > 0:
                                if txn_data.get("is_regulated") is True:
                                    regulated_total_savings += current_saving
                                else:
                                    unregulated_total_savings += current_saving
                                
                                network_total_savings[network] = network_total_savings.get(network, 0.0) + current_saving

                        if txn_data["is_eligible_for_debit_routing"] == "Yes": batch_total_processed_dg_eligible += hs_returned_amount_dollars
                except Exception as dg_e: # More specific exception for DG call if needed for debugging
                    safe_print(f"{YELLOW}Batch {batch_id}, Txn {i}: DG API call failed. Error: {dg_e}{RESET}")
                    # txn_data already has default N/A values for DG fields
                    pass 
        except requests.exceptions.HTTPError as http_err:
            txn_data["status"] = f"FAILED_HS_HTTP_{http_err.response.status_code}"
            safe_print(f"{RED}Batch {batch_id}, Txn {i} ({label}): HS API HTTP Error. Status: {http_err.response.status_code}, Response: {http_err.response.text[:200]}...{RESET}")
        except requests.exceptions.RequestException as req_err: # Catches ConnectionError, Timeout, etc.
            txn_data["status"] = "FAILED_HS_REQUEST_EXCEPTION"
            safe_print(f"{RED}Batch {batch_id}, Txn {i} ({label}): HS API Request Exception. Error: {req_err}{RESET}")
        except json.JSONDecodeError as json_err:
            txn_data["status"] = "FAILED_HS_JSON_PARSE"
            safe_print(f"{RED}Batch {batch_id}, Txn {i} ({label}): HS API JSON Decode Error. Error: {json_err}{RESET}")
        except Exception as e: # Fallback for any other unexpected error during HS call
            txn_data["status"] = "FAILED_HS_UNEXPECTED_ERROR"
            safe_print(f"{RED}Batch {batch_id}, Txn {i} ({label}): HS API Unexpected Error. Error: {e}{RESET}")
            
        if txn_data["status"] != "succeeded": txn_data["saving_percentage"] = 0
        # Ensure is_eligible_for_debit_routing, is_debit_routed, is_regulated are set even if DG call fails or for non-debit transactions
        if payment_type != "debit" or label == "Not Co-badged Debit":
            txn_data["is_eligible_for_debit_routing"] = "No"
            txn_data["is_debit_routed"] = "No"
            if "is_regulated" not in txn_data: # Only set to N/A if not already set by DG
                 txn_data["is_regulated"] = "N/A"
        
        batch_simulation_data.append(txn_data) 

        with transaction_counter_lock:
            current_transaction_number += 1
            log_txn_num = current_transaction_number
        
        # Log transaction details using safe_print
        card_type_label_log = txn_data.get('label', 'Unknown Card')
        if txn_data.get('payment_type') == 'credit': card_type_display_log = "Credit"
        elif card_type_label_log == "Not Co-badged Debit": card_type_display_log = "Single Network Debit"
        elif card_type_label_log == "Regulated Debit": card_type_display_log = "Regulated Debit"
        elif "Unregulated Debit" in card_type_label_log: card_type_display_log = "Unregulated Debit"
        elif "Global Cheaper" in card_type_label_log: card_type_display_log = "Co-badged Debit (Global Network)"
        else: card_type_display_log = card_type_label_log
        
        lcn_log = "N/A"
        if txn_data.get("co_badged_card_networks") and txn_data["co_badged_card_networks"] != "N/A":
            lcn_log = txn_data["co_badged_card_networks"].split(',')[0].strip()

        safe_print(f"[{log_txn_num}]")
        safe_print(f"Card Type: {card_type_display_log} | Amount: ${txn_data['amount']}")
        safe_print(f"IsDebitRouted: {txn_data['is_debit_routed']} | Least Cost Network: {lcn_log} | Savings: {txn_data['saving_percentage']:.2f}%")
        safe_print("-" * 20)

        if INTER_PAYMENT_SLEEP_SEC > 0: time.sleep(INTER_PAYMENT_SLEEP_SEC)
        
        # Periodically send chart data updates (e.g., after every 50 transactions within this batch)
        if (i % 50 == 0 and i > 0) or i == len(transactions_for_this_batch):
             with summary_lock:
                 chart_data_update = {
                     'type': 'chart_update',
                     'content': {
                         'transactionDistribution': network_transaction_counts,
                         'dailySavings': {
                             'regulated': round(regulated_total_savings, 2),
                             'unregulated': round(unregulated_total_savings, 2)
                         },
                         'dailyVolume': {
                             'regulated': regulated_successful_count,
                             'unregulated': unregulated_successful_count
                         },
                         'savingsByNetwork': network_total_savings
                     }
                 }
                 # Send as an SSE event
                 print(f"event: chart_update\ndata: {json.dumps(chart_data_update)}\n\n")
                 sys.stdout.flush() # Ensure the output is sent immediately

    with summary_lock:
        results_list.append({
            "data": batch_simulation_data,
            "savings": batch_total_savings,
            "processed_dg_eligible": batch_total_processed_dg_eligible,
            "processed_all": batch_total_processed_all
        })
        # Aggregate all results so far
        partial_sim_data = []
        partial_savings = 0.0
        partial_processed = 0.0
        for result in results_list:
            partial_sim_data.extend(result["data"])
            partial_savings += result["savings"]
            partial_processed += result["processed_all"]
        partial_debit_routed = sum(1 for txn in partial_sim_data if txn.get("is_debit_routed") == "Yes")
        partial_savings_percentage = (partial_savings / partial_processed * 100) if partial_processed > 0 else 0
        partial_summary = {
            "overall_savings_percentage": round(partial_savings_percentage, 2),
            "total_processed_amount": round(partial_processed, 2),
            "total_debit_routed_transactions": partial_debit_routed
        }
        print(f"data: {json.dumps({'type': 'summary', 'content': partial_summary})}")

def simulate_debit_routing():
    global TOTAL_TRANSACTIONS, current_transaction_number
    TOTAL_TRANSACTIONS = NO_OF_BATCHES * BATCH_SIZE
    current_transaction_number = 0 
    global_run_id = str(uuid.uuid4())
    safe_print(f"🔁 Starting Simulation with {TOTAL_TRANSACTIONS} transactions ({NO_OF_BATCHES} batches of {BATCH_SIZE})... (Global Run ID: {global_run_id})")
    safe_print(f"    Using API Key: ...{API_KEY[-4:] if len(API_KEY) > 4 else API_KEY}")
    safe_print(f"    Using Profile ID: {PROFILE_ID}")
    safe_print(f"    Input Amount Range: ${INPUT_MIN_AMOUNT} - ${INPUT_MAX_AMOUNT}")
    safe_print(f"    Targeting Payments: {PAYMENTS_API_URL}, Decide: {DECIDE_GATEWAY_API_URL}\n")

    if TOTAL_TRANSACTIONS <= 0: safe_print(f"{RED}❌ TOTAL_TRANSACTIONS must be positive. Received: {TOTAL_TRANSACTIONS}{RESET}"); return
    if not (0 <= INPUT_DEBIT_PERCENT <= 100): safe_print(f"{RED}❌ INPUT_DEBIT_PERCENT must be 0-100. Received: {INPUT_DEBIT_PERCENT}{RESET}"); return
    if not (0 <= INPUT_CO_BADGED_PERCENT <= 100): safe_print(f"{RED}❌ INPUT_CO_BADGED_PERCENT must be 0-100. Received: {INPUT_CO_BADGED_PERCENT}{RESET}"); return
    if not (0 <= INPUT_REGULATED_PERCENT <= 100): safe_print(f"{RED}❌ INPUT_REGULATED_PERCENT must be 0-100. Received: {INPUT_REGULATED_PERCENT}{RESET}"); return
    if INPUT_MIN_AMOUNT <= 0 : safe_print(f"{RED}❌ MIN_AMOUNT must be positive. Received: {INPUT_MIN_AMOUNT}{RESET}"); return
    if INPUT_MAX_AMOUNT < INPUT_MIN_AMOUNT: safe_print(f"{RED}❌ MAX_AMOUNT ({INPUT_MAX_AMOUNT}) must be >= MIN_AMOUNT ({INPUT_MIN_AMOUNT}).{RESET}"); return

    PAYMENTS_HEADERS = {"Content-Type": "application/json", "Accept": "application/json", "api-key": API_KEY, "x-feature": "router-custom"}
    card_lists_for_run = get_run_specific_cards(INPUT_MIN_AMOUNT, INPUT_MAX_AMOUNT)
    run_regulated_cards, run_unregulated_cards, run_global_network_cheaper_cards, run_not_co_badged_cards, run_credit_cards = card_lists_for_run

    overall_num_total_debit_txns = int(round(TOTAL_TRANSACTIONS * (INPUT_DEBIT_PERCENT / 100.0)))
    overall_num_credit_txns = TOTAL_TRANSACTIONS - overall_num_total_debit_txns
    overall_num_co_badged_of_debit = int(round(overall_num_total_debit_txns * (INPUT_CO_BADGED_PERCENT / 100.0)))
    overall_num_not_co_badged_debit = overall_num_total_debit_txns - overall_num_co_badged_of_debit
    overall_num_regulated_debit_routed = int(round(overall_num_co_badged_of_debit * (INPUT_REGULATED_PERCENT / 100.0)))
    overall_remaining_co_badged = overall_num_co_badged_of_debit - overall_num_regulated_debit_routed
    overall_num_global_network_cheaper = 0
    if run_global_network_cheaper_cards:
        gnc_perc = random.randint(10, 20) / 100.0 
        overall_num_global_network_cheaper = int(round(overall_remaining_co_badged * gnc_perc))
    overall_num_unregulated_debit_routed = overall_remaining_co_badged - overall_num_global_network_cheaper
    
    overall_counts = {
        "credit": overall_num_credit_txns, "not_co_badged_debit": overall_num_not_co_badged_debit,
        "regulated": overall_num_regulated_debit_routed, "global_cheaper": overall_num_global_network_cheaper,
        "unregulated": overall_num_unregulated_debit_routed
    }
    current_overall_sum = sum(overall_counts.values())
    if current_overall_sum != TOTAL_TRANSACTIONS:
        diff = TOTAL_TRANSACTIONS - current_overall_sum
        order_adj = ["unregulated", "not_co_badged_debit", "credit", "regulated", "global_cheaper"]
        if diff > 0: overall_counts[order_adj[0]] += diff
        elif diff < 0:
            for k in order_adj:
                if overall_counts[k] >= abs(diff): overall_counts[k] += diff; break
            else: safe_print(f"{YELLOW}Warning: Could not perfectly adjust overall transaction counts for rounding diff {diff}{RESET}")
    
    overall_num_credit_txns = overall_counts["credit"]
    overall_num_not_co_badged_debit = overall_counts["not_co_badged_debit"]
    overall_num_regulated_debit_routed = overall_counts["regulated"]
    overall_num_global_network_cheaper = overall_counts["global_cheaper"]
    overall_num_unregulated_debit_routed = overall_counts["unregulated"]

    safe_print(f"    Overall Transaction Distribution Plan (for {TOTAL_TRANSACTIONS} total transactions):")
    safe_print(f"    - Credit Transactions: {overall_num_credit_txns}")
    safe_print(f"    - Not Co-badged Debit: {overall_num_not_co_badged_debit}")
    safe_print(f"    - Regulated Debit Routed: {overall_num_regulated_debit_routed}")
    safe_print(f"    - Global Network Cheaper: {overall_num_global_network_cheaper}")
    safe_print(f"    - Unregulated Debit Routed: {overall_num_unregulated_debit_routed}\n")

    ALL_CARDS_TO_SIMULATE_GLOBALLY = []
    def populate_global_cards(source_list, count, name):
        if source_list and count > 0: ALL_CARDS_TO_SIMULATE_GLOBALLY.extend([random.choice(source_list) for _ in range(count)])
        elif count > 0: safe_print(f"{YELLOW}Warning: Overall count for {name} is {count}, but its card list is empty/unusable.{RESET}")

    populate_global_cards(card_lists_for_run[4], overall_num_credit_txns, "Credit") 
    populate_global_cards(card_lists_for_run[3], overall_num_not_co_badged_debit, "Not Co-badged Debit") 
    populate_global_cards(card_lists_for_run[0], overall_num_regulated_debit_routed, "Regulated Debit") 
    populate_global_cards(card_lists_for_run[2], overall_num_global_network_cheaper, "Global Cheaper") 
    populate_global_cards(card_lists_for_run[1], overall_num_unregulated_debit_routed, "Unregulated Debit") 

    if len(ALL_CARDS_TO_SIMULATE_GLOBALLY) != TOTAL_TRANSACTIONS:
        safe_print(f"{RED}CRITICAL: Mismatch in total cards prepared ({len(ALL_CARDS_TO_SIMULATE_GLOBALLY)}) vs TOTAL_TRANSACTIONS ({TOTAL_TRANSACTIONS}). Exiting.{RESET}")
        return
        
    random.shuffle(ALL_CARDS_TO_SIMULATE_GLOBALLY)

    threads = []
    for i in range(NO_OF_BATCHES):
        start_index = i * BATCH_SIZE
        end_index = start_index + BATCH_SIZE
        transactions_for_this_batch = ALL_CARDS_TO_SIMULATE_GLOBALLY[start_index:end_index]
        if not transactions_for_this_batch: continue
        thread = threading.Thread(target=run_batch, args=(i + 1, transactions_for_this_batch, global_run_id, batch_results_aggregated, PAYMENTS_HEADERS, summary_lock))
        threads.append(thread)
        thread.start()
        if INITIAL_DELAY_SEC > 0 and i == 0 : time.sleep(INITIAL_DELAY_SEC) 
    for thread in threads: thread.join()

    all_simulation_data = []
    total_savings_all_batches = 0.0
    total_processed_dg_eligible_all_batches = 0.0
    total_processed_all_types_all_batches = 0.0
    for result in batch_results_aggregated:
        all_simulation_data.extend(result["data"])
        total_savings_all_batches += result["savings"]
        total_processed_dg_eligible_all_batches += result["processed_dg_eligible"]
        total_processed_all_types_all_batches += result["processed_all"]

    overall_savings_percentage = (total_savings_all_batches / total_processed_all_types_all_batches * 100) if total_processed_all_types_all_batches > 0 else 0
    
    total_debit_routed_count = 0
    for txn_summary_item in all_simulation_data:
        if txn_summary_item.get("is_debit_routed") == "Yes":
            total_debit_routed_count += 1
            
    safe_print("\n" + "=" * 40)
    safe_print(f"       {BLUE}📊 OVERALL SIMULATION SUMMARY REPORT (Global Run ID: {global_run_id}) 📊{RESET}")
    safe_print("=" * 40)
    safe_print(f"   --- Input Percentages ---")
    safe_print(f"   - Configured Debit Percent (of Total): {INPUT_DEBIT_PERCENT}%")
    safe_print(f"   - Configured Co-badged Percent (of Debit): {INPUT_CO_BADGED_PERCENT}%")
    safe_print(f"   - Configured Regulated Percent (of Co-badged Debit): {INPUT_REGULATED_PERCENT}%")
    safe_print("-" * 40)
    safe_print("   --- Aggregated Savings & Processing (All Batches) ---")
    safe_print(f"   💰 Total Savings (as % of Total Processed Amount): {GREEN}{overall_savings_percentage:.2f}%{RESET} (Total Savings: ${total_savings_all_batches:.2f} on Total Processed: ${total_processed_all_types_all_batches:.2f})")
    safe_print(f"   💲 Total Amount Processed (All Successful Txns): ${total_processed_all_types_all_batches:.2f} USD")
    safe_print(f"   📈 Total Debit Routed Transactions: {YELLOW}{total_debit_routed_count}{RESET}")
    safe_print("=" * 40 + "\n")

    # Prepare structured summary data for SSE
    summary_data = {
        "overall_savings_percentage": round(overall_savings_percentage, 2),
        "total_processed_amount": round(total_processed_all_types_all_batches, 2),
        "total_debit_routed_transactions": total_debit_routed_count
    }
    safe_print(f"data: {json.dumps({'type': 'summary', 'content': summary_data})}\n")

    write_to_csv(all_simulation_data, CSV_FILENAME)
    # Corrected log message for CSV writing in 'w' mode
    if all_simulation_data: # Only print if data was actually written
        safe_print(f"📄 All simulation data for Global Run ID {global_run_id} written to {CSV_FILENAME} (file overwritten)")
    # If no data, write_to_csv prints its own message about clearing/creating the file.

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Debit Payments with configurable transaction mix and parallelism.")
    parser.add_argument("--api_key", type=str, default=DEFAULT_API_KEY, help="API Key for Payments API")
    parser.add_argument("--profile_id", type=str, default=DEFAULT_PROFILE_ID, help="Profile ID for Payments API")
    parser.add_argument("--no_of_batches", type=int, default=DEFAULT_NO_OF_BATCHES, help="Number of batches to run (each in a parallel thread).")
    parser.add_argument("--batch_size", type=int, default=DEFAULT_BATCH_SIZE, help="Number of transactions per batch.")
    parser.add_argument("--input_debit_percent", type=float, default=DEFAULT_INPUT_DEBIT_PERCENT, help="Percentage of total transactions that are debit (0-100).")
    parser.add_argument("--co_badged_percent", type=float, default=DEFAULT_CO_BADGED_PERCENT, help="Percentage of DEBIT transactions that should be co-badged (0-100).")
    parser.add_argument("--regulated_percent", type=float, default=DEFAULT_REGULATED_PERCENT, help="Percentage of CO-BADGED DEBIT transactions that should use regulated debit cards (0-100).")
    parser.add_argument("--min_amount", type=int, default=DEFAULT_MIN_AMOUNT, help="Minimum transaction amount for the simulation.")
    parser.add_argument("--max_amount", type=int, default=DEFAULT_MAX_AMOUNT, help="Maximum transaction amount for the simulation.")
    
    args = parser.parse_args()
    API_KEY = args.api_key
    PROFILE_ID = args.profile_id
    NO_OF_BATCHES = args.no_of_batches
    BATCH_SIZE = args.batch_size
    INPUT_DEBIT_PERCENT = args.input_debit_percent
    INPUT_CO_BADGED_PERCENT = args.co_badged_percent
    INPUT_REGULATED_PERCENT = args.regulated_percent
    INPUT_MIN_AMOUNT = args.min_amount
    INPUT_MAX_AMOUNT = args.max_amount
    
    # The CSV_FILENAME is now defined globally using absolute paths
    simulate_debit_routing()
