-- AI-P0b queue results: claim count + lag percentiles + queue size history.
SELECT count(*) AS claims,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY lag) AS lag_p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY lag) AS lag_p95,
       max(lag) AS lag_max,
       min(lag) AS lag_min
FROM claims_log;

SELECT max(size) AS max_queue_size,
       min(size) AS min_queue_size,
       round(avg(size), 1) AS avg_queue_size
FROM queue_samples;
