# Chapter 7: Query Robustness
In this chapter we're going to talk about how to make your queries robust to most data problems you'll encounter. Spend enough time working with real world data and you'll eventually get burned by one of these unexpected data issues.

Robustness means that your query will not break if the underlying data changes in unpredictable ways.

Here are some of the ways that data can change:

1. New columns are added that have NULL values for past data
2. Existing columns that didn't have NULLs before now contain NULLs
3. Columns that contained numbers or dates stored as strings now contain other values
4. The formatting of dates or numbers gets messed up and the type conversion fails.
5. The denominator in a ratio calculation becomes zero

Ideally these things should not happen but in reality they happen more often than we'd like. The purpose of this chapter is to teach you how to anticipate these problems before they happen and 

This is why I like to call this chapter **Defense Against Dirty Data**

We'll break these patterns down into two three groups:
1. Dealing with formatting issues
3. Dealing with NULLs
2. Dealing with division by zero

## Dealing with formatting issues
SQL supports 3 primitive data types, strings, numbers and dates. They allow for mathematical operations with numbers and calendar operations with dates. Oftentimes you might see numbers and dates stored as strings.

This makes it super easy to load data from text files into tables without worrying about formatting. However in order to operate on actual dates and numbers, you need to convert the strings to the native SQL type for number or date.

The standard function for converting data in SQL is `CAST()` Some other database implementations, like SQL Server, also use their own custom function called `CONVERT()`. We will use `CAST()` to both convert between types (like string to date) or within the same type (like a timestamp to date)

Here's an example of how type conversion works:
```sql
SELECT CAST('2021-12-01' as DATE);

dt        |
----------+
2021-12-01|
```

Suppose that for whatever reason the date was bad:
```sql
SELECT CAST('2021-13-01' as DATE);

Error: Could not cast literal "2021-13-01" to type DATE at [1:13]
```
Obviously there's no 13th month so BigQuery throws an error.

Same thing happens if the formatting was bad:
```sql
SELECT CAST('2021-12--01' as DATE);

Message: Could not cast literal "2021-12--01" to type DATE at [1:13]
```
The extra dash in this case messes up conversion.

Same thing can happen if you try to convert a string to a number and the formatting is malformed or the data is not a number. So how do you deal with these issues?

### Ignore Bad Data
One of the easiest ways to deal with formatting issues when converting data is to simply ignore bad formatting. What this means is we simply skip the malformed rows and don't deal with them at all. This works great in cases when the error is unfixable or occurs very rarely. So if a few rows out of 10 million are malformed and can't be fixed we can skip them

However the `CAST()` function will fail if it encounters an issue, as we just saw, and we want our query to be robust. To deal with this problem some databases introduce "safe" casting functions like `SAFE_CAST()` in BigQuery or `TRY_CAST()` in SQL Server. Not all servers provide this function though.

These functions will not fail when the formatting is unexpected but return `NULL` instead which then can be handled by using `COALESCE()` to replace `NULL` with a sensible value.

Here's how that works:
```sql
SELECT SAFE_CAST('2021-12--01' as DATE) AS dt;

    dt|
------+
 NULL |
```
Now we can apply any of the functions that deal with `NULL` and replace it or just leave it. 
```sql
SELECT COALESCE(SAFE_CAST('2021-' as INTEGER), 0) AS num;

num|
---+
  0|
```

### Force Formatting
While ignoring incorrect data is easy, you can't always get away with it. Sometimes you need to extract the valuable data from the incorrect format. This is when you need to look for repeating patterns in the incorrect data and force the formatting.

Suppose that all dates had extra dashes like this:
```
2021-12--01
2021-12--02
2021-12--03
2021-12--04
```
Since this is a regular pattern, we can extract the meaningful numbers and force the formatting like this:
```sql
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
SELECT CAST(SUBSTRING(dt, 1, 4) || '-' || 
			SUBSTRING(dt, 6, 2) || '-' || 
			SUBSTRING(dt, 10, 2) AS DATE) AS date_field 
FROM dates;

date_field
----------
2021-12-01
2021-12-02
2021-12-03
2021-12-04
2021-12-05
```
So as you can see in this example, we took advantage of the regularity of the incorrect formatting to extract the important information (the year, month and day) and reconstruct the correct formatting by concatenating strings via the `||` operator.

What if you have different types of irregularities in your data? In some cases if information is aggregated from multiple sources you might have to deal with multiple types of formatting.

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
SELECT CAST(CASE WHEN dt LIKE '%-%--%'
	             THEN SUBSTRING(dt, 1, 4) || '-' ||
					  SUBSTRING(dt, 6, 2) || '-' ||
					  SUBSTRING(dt, 10, 2)
	             WHEN dt LIKE '%/%/%'
	             THEN SUBSTRING(dt, 7, 4) || '-' ||
					  SUBSTRING(dt, 1, 2) || '-' ||
					  SUBSTRING(dt, 4, 2)
	             END AS DATE) AS date_field 
FROM dates;
```
You can repeat this pattern as many times as you want to handle each case.

Here's an example using numbers
```sql
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
	CAST(CASE WHEN wt LIKE '%lb' THEN SUBSTRING(wt, 1, INSTR(wt, 'lb')-1)
			  WHEN wt LIKE '%kg' THEN SUBSTRING(wt, 1, INSTR(wt, 'kg')-1)
         END AS DECIMAL) AS weight,
	CASE WHEN wt LIKE '%lb' THEN 'LB'
		 WHEN wt LIKE '%kg' THEN 'KG'
	END AS unit
FROM weights
```

I'm using the `SUBSTRING()` function again to extract parts of a string, but this time I add the function `INSTR()` which searches for a string within another string and returns the first occurrence of it or 0 if not found. 

### Dealing with NULLs
As a rule, you should always assume any column can be NULL at any point in time so it's a good idea to provide a default value for that column as part of your SELECT. This way you make sure that even if your data becomes NULL your query will not fail.

NULLs in SQL represent unknown values. While the data may appear to be blank or empty in the results, it's not the same as an empty string or white space. You cannot compare NULLs to anything directly, for example you cannot say:
```sql
SELECT col1
FROM table
WHERE col2 = NULL;
```

You get NULL whenever you perform any type of calculation with NULL like adding or subtracting, multiplying or dividing. Doing any operation with an unknown value is still unknown. 

Since you cannot compare to NULL using the equals sign (=) SQL deals with NULLs using the `IS` keyword. `IS NULL` literally means is unknown. To replace NULLs with a default value when you're doing conversions, you use `COALESCE()` which takes a comma-separated list of values and returns the first non-null value.

So in order to protect against unexpected NULLs it's often a good idea for your production queries to wrap `COALESCE()` around all the fields.
```sql
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
    UNION ALL 
    SELECT '13/05/2021' AS dt
)
SELECT COALESCE(SAFE_CAST(
            CASE WHEN dt LIKE '%-%--%'
            THEN SUBSTRING(dt, 1, 4) || '-' ||
                 SUBSTRING(dt, 6, 2) || '-' ||
                 SUBSTRING(dt, 10, 2)
            WHEN dt LIKE '%/%/%'
            THEN SUBSTRING(dt, 7, 4) || '-' ||
                 SUBSTRING(dt, 1, 2) || '-' ||
                 SUBSTRING(dt, 4, 2)
            END AS DATE), '1900-01-01') AS date_field 
FROM dates;
```

This is the same query we saw earlier but implemented using "defensive coding" where we replace malformed data with a fixed value of `1900-01-01`. This protects our query from failing and later we can investigate why the data was junk.

### Dealing with division by zero
Whenever you need to calculate ratios you always have to worry about division by zero. Your query might work when you first write it, but if the denominator ever becomes zero your query will fail.

The easiest way to handle this is by excluding zero values in the where clause as we do in our query
```sql
SELECT
    ROUND(CAST(total_comments_on_post /
		total_posts_created AS NUMERIC), 1)  AS comments_on_post_per_post
FROM
    total_metrics_per_user
WHERE
    total_posts_created > 0
ORDER BY 
    total_questions_created DESC;
```

This will work fine in some cases but it also will filter the entire dataset causing counts to be wrong. One way to handle this is by using a `CASE` statement like this:
```sql
SELECT
    CASE
        WHEN total_posts_created > 0
        THEN ROUND(CAST(total_comments_on_post /
                        total_posts_created AS NUMERIC), 1)
        ELSE 0
    END AS comments_on_post_per_post,
    CASE
        WHEN streak_in_days > 0
        THEN ROUND(CAST(total_posts_created /
				        streak_in_days AS NUMERIC), 1)
    END AS posts_per_day
FROM
    total_metrics_per_user
ORDER BY 
    total_questions_created DESC;
```
This works but is not as elegant. BigQuery offers another way we can do this more cleanly. Just like the `SAFE_CAST()` function, it has a `SAFE_DIVIDE()` function which returns NULL in the case of divide-by-zero error. Then you simply deal with NULL values using `COALESCE()`

```sql
SELECT
	ROUND(CAST(IFNULL(SAFE_DIVIDE(total_posts_created, 
		streak_in_days), 0) AS NUMERIC), 1) AS posts_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_comments_by_user, 
		total_posts_created), 0) AS NUMERIC), 1)  AS user_comments_per_post
FROM
    total_metrics_per_user
ORDER BY 
    total_questions_created DESC;
```
Now that's far more elegant isn't it?  Snowflake also implements a similar function they call `DIV0()` which automatically returns 0 if there's a division by zero error.

### Comparing Strings
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