# Chapter 8: Odds and Ends
This chapter contains a varied selection of useful patterns that didn't fit in any of the previous sections. Hopefully you'll find something useful here.

## Generating fake data with SQL
There are many situations where generating fake data can be very useful. For example there may be cases where you want to have a table of dates with one row per date, often known as a "date spine" table or there may be cases where you want to fill up a table with fake data for testing.

DuckDB (and a few other databases) offer a very simple way to generate as many rows as you want using the function `generate_data()` This is a table-valued function which means that you generate data using `select` like this:
```sql
SELECT * FROM generate_series(10);

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

There are endless possibilities for how you can use this function, so let's look at some examples.
### Generating a date spine
 Sometimes however dates might be missing and you can't use the transaction date as a "date spine" For cases like these, generating an empty "date spine" could be very useful.


## Generating fake data with SQL

## Comparing tables row by row

## Table Subtraction
(joining tables on row hash)
## Generating SQL with SQL
(Applying repeating SQL through information_schema)

## Cubes and Rollups

