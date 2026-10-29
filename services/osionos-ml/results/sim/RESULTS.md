# SYNTHETIC — the recommender's model, measured offline (M3c-1)

SYNTHETIC DATA. Every number below comes from a simulated event log — no real osionos user is in it. It says how the MODEL behaves on a log with a known shape, nothing more.

## The run

- log: 2000 users, 3000 items, 20 topics, 60000 events, seed 42
- split: 37016 train / 10184 validation / 12800 test events, 2000 users with a held-out item
- tuned on VALIDATION only: regularization 0.05, alpha 10.0, 15 iterations, 16 factors (validation nDCG@10 0.1082)
- scored on TEST: 2000 users, items the user has already seen excluded

| system | nDCG@10 | recall@20 | coverage@20 | novelty@10 |
| --- | --- | --- | --- | --- |
| ials | 0.1154 | 0.1247 | 0.0797 | 6.944 |
| popularity | 0.0775 | 0.0929 | 0.0068 | 5.482 |
| random | 0.0020 | 0.0026 | 0.9993 | 13.272 |

## The gate

iALS nDCG@10 - popularity nDCG@10 = **0.0379**

Paired bootstrap 95% CI (1000 resamples over the users, seed 42): **[0.0322, 0.0433]**

- iALS beats popularity: yes
- CI lower bound above zero: yes

## Versions

- osml 0.1.0, python 3.12.15, numpy 2.5.3, scipy 1.18.1
