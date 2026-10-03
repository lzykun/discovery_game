# %%
import pandas as pd
import numpy as np
import json
import os


# %%
# Paths 
DATA_PATH   = "..."
PREVIEW_PATH = "..."
OUTPUT_PATH  = "..."

# Config 
SAMPLE_N = 10
RANDOM_SEED = 42

# %%
# Sample top messages by condition, weighted by log(total_points)
df = pd.read_csv(DATA_PATH)
df["log_points"] = np.log1p(df["total_points"])

sampled = (
    df.groupby("condition", group_keys=False)
      .apply(lambda g: g.sample(
          n=min(SAMPLE_N, len(g)),
          weights=g["log_points"].clip(lower=0) + 1e-6 if len(g) > SAMPLE_N else None,
          random_state=RANDOM_SEED
      ))
      .reset_index(drop=True)
)
sampled = sampled.sort_values(["condition", "log_points"], ascending=[True, False])
sampled["sample_id"] = range(1, len(sampled) + 1)

# Structure: { condition: [ { sample_id, id, messageHow, messageRules, nchar_how, nchar_rules, total_points }, ... ] }
output = {}
for condition, group in sampled.groupby("condition"):
    output[condition] = group[[
        "sample_id", "id", "messageHow", "messageRules", "nchar_how", "nchar_rules", "total_points"
    ]].to_dict(orient="records")

js_content = f"const messages = {json.dumps(output, indent=2)};\n"
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
with open(OUTPUT_PATH, "w") as f:
    f.write(js_content)

# Save (JS format)
messages = {}
for cond, subdf in sampled.groupby("condition"):
    messages[cond] = subdf[
        ["sample_id", "id", "messageHow", "messageRules", "total_points"]
        ].to_dict(orient="records")

with open(OUTPUT_PATH, "w") as f:
    import json
    f.write("const messages = ")
    json.dump(messages, f, indent=2)
    f.write(";")
