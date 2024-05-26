# Chapter 5: Robustness Patterns
In this chapter we're going to talk about how to make your queries robust to most data problems you'll encounter. Spend enough time working with real world data and you'll eventually get burned by one of these. That's so it's important to know about them ahead of time and write defensive code. Which is why my alternative title for this chapter is *Defense Against Dirty Data.*

Robustness means that your query will not break if the underlying data changes in unpredictable ways.

Here are some of the ways that data can change:
1. New columns are added that have NULL values for past data
2. Existing columns that didn't have NULLs before now contain NULLs
3. Columns that contained numbers or dates stored as strings now contain other values
4. The formatting of dates or numbers gets messed up and type conversion fails.
5. The denominator in a ratio calculation becomes zero
6. Strings have different casing so direct comparison fails

We'll break these patterns down into two three groups:
1. Handing formatting issues
3. Handing NULLs
2. Handing division by zero
3. Handing inconsistent comparisons

## Handling Formatting Issues
SQL supports 3 primitive data types, strings, numbers and dates. They allow for mathematical operations with numbers, calendar operations with dates and many types of string operations. 

It's quite common to see numbers and dates stored as strings, especially when you're loading flat text files like CSVs or TSVs. Some data loading tools will try and guess the type and format it on the fly but they're not always correct. So you will often have to manually convert dates and numbers.

The standard function for converting data in SQL is `CAST().` Some other database implementations, like SQL Server, also use their own custom function called `CONVERT()` but also support `CAST().` We will use `CAST()` to both convert between types (like string to date) or within the same type (like a timestamp to date)

Here's an example of how type conversion works:
```sql
--listing 5.1
SELECT CAST('2021-12-01' as DATE);

CAST('2021-12-01' AS DATE)|
--------------------------+
                2021-12-01|
```

That should work in most cases but of there are always exceptions. Suppose that for whatever reason the date was bad:
```sql
--listing 5.2
SELECT CAST('2021-13-01' as DATE);

Conversion Error: date field value out of range: "2021-13-01", expected format is (YYYY-MM-DD)
```

Obviously there's no 13th month so we get an error. What if the date was fine but the formatting was bad?
```sql
--listing 5.3
SELECT CAST('2021-12--01' as DATE);

Conversion Error: date field value out of range: "2021-12--01", expected format is (YYYY-MM-DD)
```

The extra dash in this case messes up automatic conversion, but the date itself was correct. What if you try to convert a string to a number and the data is not numeric?
```sql
--listing 5.4
SELECT CAST('2o21' as INT);

Conversion Error: Could not convert string '2o21' to INT32
```

So how do we deal with these issues? Let's have a look at some patterns.

### Pattern 1: Ignore or Replace Bad Data
One of the easiest ways to deal with formatting issues when converting data is to simply ignore bad formatting. What this means is we simply skip the malformed rows when querying data. This works great in cases when the error is unfixable or occurs very rarely. So if a few rows out of 10 million are malformed and can't be fixed we can skip them.

However the `CAST()` function will fail if it encounters an issue, thus breaking the query, and we want our query to be robust. To deal with this problem some databases introduce "safe" casting functions like `SAFE_CAST()` or `TRY_CAST().`

*Note*: Not all servers provide this function. PostgreSQL for example doesn't have built-in safe casting but it can be built as custom user defined function (UDF).

`SAFE_CAST()` and `TRY_CAST()` are designed to return `NULL` if the conversion fails instead of breaking. We can then handle `NULL` by `COALESCE()` to replace the bad values with a sensible value.

DuckDB uses `TRY_CAST()` so let's see it in action:
```sql
--listing 5.5
SELECT TRY_CAST('2021-12--01' as DATE) AS dt;

    dt|
------+
 NULL |
```

And if we want to skip the incorrect values we leave it as is. If however we don't want to skip the bad rows we can replace them by using `COALESCE():`
```sql
--listing 5.6
SELECT COALESCE(TRY_CAST('2o21' as INT), 0) AS year;

year|
----+
   0|
```

### Pattern 2: Force Formatting (if possible)
While ignoring incorrect data is easy, you can't always get away with it. Sometimes you need to extract the actual data by finding patterns in how formatting is broken and fixing them using string parsing functions. Let's see some examples

Suppose that some of the rows of dates had extra dashes like this:
```
2021-12--01
2021-12--02
2021-12--03
2021-12--04
```

Since this is a recurring format, we can use string parsing functions to remove the extra dash and then do the conversion like this:
```sql
--listing 5.7
WITH dates AS (
    SELECT '2021-12--01' AS dt
    UNION ALL 
    SELECT '2021-12--02' AS dt
    UNION ALL 
    SELECT '2021-12--03' AS dt
    UNION ALL 
    SELECT '2021-12--04' AS dt
    UNION ALL 
    SELECT '2021-12--05' AS dt
)
SELECT TRY_CAST(SUBSTRING(dt, 1, 4) || '-' || 
				SUBSTRING(dt, 6, 2) || '-' || 
				SUBSTRING(dt, 10, 2) AS DATE) AS date_field 
FROM dates;

date_field|
----------+
2021-12-01|
2021-12-02|
2021-12-03|
2021-12-04|
2021-12-05|
```

So as you can see in this example, we took advantage of the regularity of the incorrect formatting to extract the the year, month and day from the rows and reconstruct the correct formatting by concatenating strings via the `||` operator.

What if you have different types of irregularities in your data? In some cases if information is aggregated from multiple sources you might have to deal with mixed formatting.

Let's take a look at an example:
```
dt         |
-----------+
2021-12--01|
2021-12--02|
2021-12--03|
12/04/2021 |
12/05/2021 |
```

Obviously we can't force the same formatting for all the dates here so we'll have to split this up and apply the pattern separately using the `CASE` statement:
```sql
--listing 5.8
WITH dates AS (
    SELECT '2021-12--01' AS dt
    UNION ALL 
    SELECT '2021-12--02' AS dt
    UNION ALL 
    SELECT '2021-12--03' AS dt
    UNION ALL 
    SELECT '12/04/2021' AS dt
    UNION ALL 
    SELECT '12/05/2021' AS dt
)
SELECT TRY_CAST(CASE WHEN dt LIKE '%-%--%'
	            THEN SUBSTRING(dt, 1, 4) || '-' ||
					 SUBSTRING(dt, 6, 2) || '-' ||
					 SUBSTRING(dt, 10, 2)
	            WHEN dt LIKE '%/%/%'
	            THEN SUBSTRING(dt, 7, 4) || '-' ||
					 SUBSTRING(dt, 1, 2) || '-' ||
					 SUBSTRING(dt, 4, 2)
	            END AS DATE) AS date_field 
FROM dates;

--sample output
date_field|
----------+
2021-12-01|
2021-12-02|
2021-12-03|
2021-12-04|
2021-12-05|
```
Notice how we're separating rows with different formatting using the `CASE` and `LIKE` operators to handle each of them differently. You can repeat this pattern as many times as you want to handle each different format.

Here's an example using numbers
```sql
--listing 5.9
WITH weights AS (
    SELECT '32.5lb' AS wt
    UNION ALL 
    SELECT '45.2lb' AS wt
    UNION ALL 
    SELECT '53.1lb' AS wt
    UNION ALL 
    SELECT '77kg' AS wt
    UNION ALL 
    SELECT '68kg' AS wt
)
SELECT 
	TRY_CAST(CASE WHEN wt LIKE '%lb' THEN SUBSTRING(wt, 1, INSTR(wt, 'lb')-1)
				  WHEN wt LIKE '%kg' THEN SUBSTRING(wt, 1, INSTR(wt, 'kg')-1)
         END AS DECIMAL) AS weight,
	CASE WHEN wt LIKE '%lb' THEN 'LB'
		 WHEN wt LIKE '%kg' THEN 'KG'
	END AS unit
FROM weights;

--sample output
weight|unit|
------+----+
32.500|LB  |
45.200|LB  |
53.100|LB  |
77.000|KG  |
68.000|KG  |
```

I'm using the `SUBSTRING()` function again to extract parts of a string, and I used the `INSTR()` function, which searches for a string within another string and returns the first occurrence of it or 0 if not found, in order to tell the `SUBSTRING()` function how many characters to read.

## Handling NULLs
`NULLs` in SQL represent unknown values. While the data may appear to be blank or empty in the results, it's not the same as an empty string or white space. The reason we want to handle them is because they cause issues when it comes to comparing fields or joining data. They might confuse users, so as a general pattern you should replace `NULLs` with predetermined default values.

### Pattern 3: Assume NULL
As a rule, you should always assume any column can be `NULL` at any point in time so it's a good idea to provide a default value for that column as part of your `SELECT`. This way you make sure that even if your data becomes `NULL` your query will not fail.

For strings you might use default values such as `NA`, `Not Provided`, `Not Available`, etc. Dates and numbers are trickier. For a date field you might use a default value such as `1900-01-01` and that's a safe enough signal that the data is not available.

Doing this however could mess up age calculations, especially if the age is later averaged, so be careful where you use it. Same thing applies to using a default value like `0`, `-1`, or `9999` for numbers. It might make sense when the column cannot be 0 or negative, but not always.

You do this by using `COALESCE()` as described earlier:
```sql
--listing 5.7
SELECT
    id,
    COALESCE(display_name, 'unknown') AS user_name,
    COALESCE(about_me, 'unknown') AS about_me,
    COALESCE(age, 'unknown') AS age,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(last_access_date, '1900-01-01') AS last_access_date,
    COALESCE(location, 'unknown') AS location,
    COALESCE(reputation, 0) AS reputation,
    COALESCE(up_votes, 0) AS up_votes,
    COALESCE(down_votes, 0) AS down_votes,
    COALESCE(views, 0) AS views,
    COALESCE(profile_image_url, 'unknown') AS profile_image_url,
    COALESCE(website_url, 'unknown') AS website_url
FROM
    users
LIMIT 10;
```

Since `id` is the primary key in this table it can't be `NULL` so we choose not to handle it, but we do handle everything else regardless of whether it's NULL or not.
## Handing Division By Zero
When you calculate ratios you must always handle potential division by zero. Your query might work when you first test it, but if the denominator ever becomes zero it will fail.

### Pattern 4: Skip Rows With 0 Denominator
The easiest way to handle this is by excluding zero values in the denominator. This will work fine but it will also filter out rows which could be needed.

Here's an example:
```sql
WITH cte_test_data AS (
    SELECT 94 as comments_on_post, 38 as posts_created
    UNION ALL
    SELECT 62, 0
    UNION ALL
    SELECT 39, 20
    UNION ALL
    SELECT 34, 19
    UNION ALL
    SELECT 167, 120
    UNION ALL
    SELECT 189, 48
    UNION ALL
    SELECT 96, 17
    UNION ALL
    SELECT 15, 15
)
SELECT
    ROUND(CAST(comments_on_post AS NUMERIC) / 
          CAST(posts_created AS NUMERIC), 1) AS comments_on_post_per_post
FROM
    cte_test_data
WHERE
    posts_created > 0;

--sample output
comments_on_post_per_post|
-------------------------+
                      2.5|
                      2.0|
                      1.8|
                      1.4|
                      3.9|
                      5.6|
                      1.0|
```


### Pattern 5: Anticipate and Bypass
The best way to handle division by zero without filtering out rows is to use a `CASE` statement. While this will work, there are other options. Cloud warehouses like BigQuery offer a `SAFE_DIVIDE()` function which returns `NULL` in the case of divide-by-zero error.

Then you simply deal with `NULL` values using `COALESCE()` like above. Snowflake offers a similar function called `DIV0()` which automatically returns 0 if there's a division by zero error. DuckDB on the other hand seems to handle divide by zero directly without throwing an error.

Here's an example:
```sql
WITH cte_test_data AS (
    SELECT 94 as comments_on_post, 38 as posts_created
    UNION ALL
    SELECT 62, 0
    UNION ALL
    SELECT 39, 20
    UNION ALL
    SELECT 34, 19
    UNION ALL
    SELECT 167, 120
    UNION ALL
    SELECT 189, 48
    UNION ALL
    SELECT 96, 17
    UNION ALL
    SELECT 15, 15
)
SELECT
    CASE
	    WHEN posts_created > 0 THEN
		    ROUND(CAST(comments_on_post AS NUMERIC) / 
		          CAST(posts_created AS NUMERIC), 1)
	     ELSE 0
	END AS comments_on_post_per_post
FROM
    cte_test_data;
```

## Handling Inconsistent Comparison
I said earlier that strings are the easiest way to store any kind of data (numbers, dates, strings) but strings also have their own issues, especially when you're trying to join on a string field.

Here are some issues you'll undoubtedly run into with strings. 
1. Inconsistent casing
2. Space padding
3. Non-ASCII characters

Many databases are case sensitive so if the same string is stored with different cases it will not match when doing a join. Let's see an example:
```sql
SELECT 'string' = 'String' AS test;

test |
-----+
false|
```

As you can see, a different case causes the test to show as `FALSE` The only way to deal with this problem when joining on strings or matching patterns on a string is to convert all fields to upper or lower case.
```sql
SELECT LOWER('string') = LOWER('String') AS test;

test|
----+
true|
```

Space padding is the other common issue you deal with strings.
```sql
SELECT 'string' = ' string' AS test;

test |
-----+
false|
```

You deal with this by using the `TRIM()` function which removes all the leading and trailing spaces.
```sql
SELECT TRIM('string') = TRIM(' string') AS test;

test|
----+
true|
```

If you ever have to join on an email column these functions are absolutely essential. It's best to combine them just to be sure:
```sql
SELECT TRIM(LOWER('String')) = TRIM(LOWER(' string')) AS test;

test|
----+
true|
```

That wraps up our chapter on query robustness. In the next chapter we get to see the entire query for user engagement. It's also a great opportunity to review what we've learned so far.