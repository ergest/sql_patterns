# Chapter 8: Odds and Ends
This chapter contains a varied SELECTion of useful patterns that didn't fit in any of the previous sections. Hopefully you'll find something useful here.

## Generating fake data with SQL
There are many situations where generating fake data can be very useful. For example there may be cases where you want to have a table of dates with one row per date, often known AS a "date spine" table or there may be cases where you want to fill up a table with fake data for testing.

DuckDB (and a few other databases) offer a very simple way to generate AS many rows AS you want using the function `generate_series()` This is a table-valued function which means that you generate data using `SELECT` like this:
```sql
SELECT * FROM generate_series(1,10,1);

--result
generate_series|
---------------+
              0|
              1|
              2|
              3|
              4|
              5|
              6|
              7|
              8|
              9|
             10|
```

As you see it takes three parameters, start point, end point and step. So we could call it like this if we wanted:
```sql
SELECT * FROM generate_series(10,20,2)

--result
generate_series|
---------------+
             10|
             12|
             14|
             16|
             18|
             20|
```

There are endless possibilities for how you can use this function, so let's look at some examples.

### Generating fake transactional data

Here we see an example of how to generate timestamp data using the `generate_series()` function. We take the increasing

```sql
WITH cte_create_sequence AS (
    SELECT seq.id
    FROM generate_series(100) AS seq (id)
)
, cte_create_timestamp AS (
    SELECT id, TIMEZONE('utc', NOW()) - 
	    TO_SECONDS(FLOOR(RANDOM()*id*1000)::INT) AS created_ts
    FROM cte_create_sequence
)
SELECT
    id,
    created_ts,
    'product_'||id%25 AS product_id,
    CAST(RANDOM()*10 AS INT) AS quantity,
    ROUND(RANDOM()*10000, 2) total_amount
FROM
    cte_create_timestamp
```
### Generating a date spine
 Sometimes however dates might be missing and you can't use the transaction date AS a "date spine" For cases like these, generating an empty "date spine" could be very useful.


## Generating fake data with SQL

## Comparing tables row by row

## Table Subtraction
(joining tables on row hash)
## Generating SQL with SQL
(Applying repeating SQL through information_schema)

## Cubes and Rollups

