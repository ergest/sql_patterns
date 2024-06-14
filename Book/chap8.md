# Chapter 8: Odds and Ends
This chapter contains a varied SELECTion of useful patterns that didn't fit in any of the previous sections. Hopefully you'll find something useful here.

## Generating fake data with SQL
There are many situations where generating fake data can be very useful. For example there may be cases where you want to have a table of dates with one row per date, often known AS a "date spine" table or there may be cases where you want to fill up a table with fake data for testing.

DuckDB (and a few other databases) offer a very simple way to generate AS many rows AS you want using function `generate_series()` or '`range()` These are table-valued function which means that query them like this:
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
### Generating a date dimension
 Many data warehouses are missing this key table. Having a date dimension allows you to generate and store all the possible ways you can slice a date by. Here's how you can generate one:
 ```sql
 WITH generate_date AS (
    SELECT CAST(RANGE AS DATE) AS date_key 
    FROM RANGE(DATE '2000-01-01', DATE '2031-12-31', INTERVAL 1 DAY)
)
SELECT
    date_key AS date_key,
    DAYOFYEAR(date_key) AS day_of_year, 
    YEARWEEK(date_key) AS week_key,
    WEEKOFYEAR(date_key) AS week_of_year,
    DAYOFWEEK(date_key) AS day_of_week,
    ISODOW(date_key) AS iso_day_of_week,
    DAYNAME(date_key) AS day_name,
    DATE_TRUNC('week', date_key) AS first_day_of_week,
    DATE_TRUNC('week', date_key) + 6 AS last_day_of_week,
    YEAR(date_key) || RIGHT('0' || MONTH(date_key), 2) AS month_key,
    MONTH(date_key) AS month_of_year,
    DAYOFMONTH(date_key) AS day_of_month,
    LEFT(MONTHNAME(date_key), 3) AS month_name_short,
    MONTHNAME(date_key) AS month_name,
    DATE_TRUNC('month', date_key) AS first_day_of_month,
    LAST_DAY(date_key) AS last_day_of_month,
    CAST(YEAR(date_key) || QUARTER(date_key) AS INT) AS quarter_key,
    QUARTER(date_key) AS quarter_of_year,
    CAST(date_key - DATE_TRUNC('Quarter', date_key) + 1 AS INT) AS day_of_quarter,
    ('Q' || QUARTER(date_key)) AS quarter_desc_short,
    ('Quarter ' || QUARTER(date_key)) AS quarter_desc,
    DATE_TRUNC('quarter', date_key) AS first_day_of_quarter,
    LAST_DAY(DATE_TRUNC('quarter', date_key) + INTERVAL 2 MONTH) as last_day_of_quarter,
    CAST(YEAR(date_key) AS INT) AS year_key,
    DATE_TRUNC('Year', date_key) AS first_day_of_year,
    DATE_TRUNC('Year', date_key) - 1 + INTERVAL 1 YEAR AS last_day_of_year,
    ROW_NUMBER() OVER (PARTITION BY YEAR(date_key), MONTH(date_key), DAYOFWEEK(date_key) ORDER BY date_key) AS ordinal_weekday_of_month
FROM 
    generate_date
```

## Comparing tables row by row

## Table Subtraction
(joining tables on row hash)
## Generating SQL with SQL
(Applying repeating SQL through information_schema)

## Cubes and Rollups

#### Talk about deduping rows via row_number() and qualify
#### Talk about rank() and dense_rank() applications

## Crosstab
## Deduping Data Deliberately
(by using row_number() with qualify())

## Temporal joins
