from flask import Flask, render_template, request, jsonify
import pickle
import numpy as np
import warnings
import traceback

warnings.filterwarnings('ignore')

app = Flask(__name__)

# ── Load model ────────────────────────────────────────────────────────────────
with open('flight_fare_model.pkl', 'rb') as f:
    model = pickle.load(f)

FEATURE_NAMES = list(model.feature_names_in_)

# ── Route → feature-column mapping ───────────────────────────────────────────
ROUTE_COLUMNS = [c for c in FEATURE_NAMES if c.startswith('Route_')]

def build_route_key(source_code: str, dest_code: str) -> str:
    """Return the direct route string (only non-stop / direct routes)."""
    return f"Route_{source_code} → {dest_code}"

# Known source → airport code map
SOURCE_CODE = {
    'Banglore': 'BLR',
    'Mumbai':   'BOM',
    'Kolkata':  'CCU',
    'Delhi':    'DEL',
    'Chennai':  'MAA',
}

# Known destination → feature column suffix
DEST_FEATURE = {
    'New Delhi':  'New Delhi',
    'Cochin':     'Cochin',
    'Kolkata':    'Kolkata',
    'Hyderabad':  'Hyderabad',
    'Delhi':      'Delhi',
    'Banglore':   'Banglore',   # not present in test data but kept
}

# ── Helper: build a zeroed feature vector ────────────────────────────────────
def make_feature_vector(data: dict) -> np.ndarray:
    vec = {f: 0 for f in FEATURE_NAMES}

    # -- Numeric fields --
    vec['Journey_day']    = int(data['journey_day'])
    vec['Journey_month']  = int(data['journey_month'])
    vec['Dep_hour']       = int(data['dep_hour'])
    vec['Dep_min']        = int(data['dep_min'])
    vec['Arrival_hour']   = int(data['arr_hour'])
    vec['Arrival_min']    = int(data['arr_min'])
    vec['Duration_hours'] = int(data['dur_hours'])
    vec['Duration_mins']  = int(data['dur_mins'])

    # -- Airline one-hot --
    airline_col = f"Airline_{data['airline']}"
    if airline_col in vec:
        vec[airline_col] = 1

    # -- Source one-hot --
    source_col = f"Source_{data['source']}"
    if source_col in vec:
        vec[source_col] = 1

    # -- Destination one-hot (standalone columns at the end) --
    dest = data.get('destination', '')
    dest_col = DEST_FEATURE.get(dest, '')
    if dest_col and dest_col in vec:
        vec[dest_col] = 1

    # -- Total Stops one-hot --
    stops = int(data.get('stops', 0))
    if stops >= 1:
        stop_col = f"Total_Stops_{stops}" if stops <= 2 else 'Total_Stops_3 stops'
        if stop_col in vec:
            vec[stop_col] = 1

    # -- Route: try to match a route column (best effort) --
    src_code = SOURCE_CODE.get(data['source'], '')
    dest_raw = data.get('destination', '')
    # map destination name to airport code(s) — simple heuristic
    dest_code_map = {
        'New Delhi':  'DEL',
        'Delhi':      'DEL',
        'Mumbai':     'BOM',
        'Banglore':   'BLR',
        'Kolkata':    'CCU',
        'Cochin':     'COK',
        'Hyderabad':  'HYD',
    }
    dst_code = dest_code_map.get(dest_raw, '')

    if src_code and dst_code:
        direct_key = f"Route_{src_code} \u2192 {dst_code}"   # '→' char
        if direct_key in vec:
            vec[direct_key] = 1
        else:
            # Fall back: pick any route that starts with src and contains dst code
            for rc in ROUTE_COLUMNS:
                parts = rc.replace('Route_', '').split(' \u2192 ')
                if parts and parts[0] == src_code and parts[-1] == dst_code:
                    vec[rc] = 1
                    break

    # -- Additional Info: default "No info" --
    if 'Additional_Info_No info' in vec:
        vec['Additional_Info_No info'] = 1

    return np.array([vec[f] for f in FEATURE_NAMES], dtype=float)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    try:
        payload = request.get_json(force=True)

        # -- Parse journey date --
        from datetime import datetime, timedelta
        date_str = payload.get('journey_date', '')
        time_dep  = payload.get('dep_time', '00:00')
        time_arr  = payload.get('arr_time', '00:00')

        journey_dt = datetime.strptime(date_str, '%Y-%m-%d')
        dep_h, dep_m = map(int, time_dep.split(':'))
        arr_h, arr_m = map(int, time_arr.split(':'))

        # Duration calculation
        dep_total  = dep_h * 60 + dep_m
        arr_total  = arr_h * 60 + arr_m
        diff       = arr_total - dep_total
        if diff < 0:
            diff += 24 * 60          # overnight flight
        dur_hours  = diff // 60
        dur_mins   = diff % 60

        data = {
            'journey_day':   journey_dt.day,
            'journey_month': journey_dt.month,
            'dep_hour':      dep_h,
            'dep_min':       dep_m,
            'arr_hour':      arr_h,
            'arr_min':       arr_m,
            'dur_hours':     dur_hours,
            'dur_mins':      dur_mins,
            'airline':       payload.get('airline', ''),
            'source':        payload.get('source', ''),
            'destination':   payload.get('destination', ''),
            'stops':         payload.get('stops', 0),
        }

        feat_vec = make_feature_vector(data)
        prediction = model.predict([feat_vec])[0]
        price = round(float(prediction), 2)

        return jsonify({
            'success': True,
            'price': price,
            'price_formatted': f'₹ {price:,.0f}',
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("SkyFare AI server starting on http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
