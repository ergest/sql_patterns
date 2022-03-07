## Chapter 7: Query Robustness

### Defensive Programming Patterns
From NULLs, to missing data, duplicate rows and random values, real world data is messy. A well-written query is robust enough to handle many of these cases without crashing or giving inaccurate results.

Real world data is not static. As companies push their development processes to release early and often, applications are in constant flux and their data is constantly changing. Bugs and other issues are always present so your queries need to be robust enough to handle these changes without breaking.

Below are some common patterns of what I like to call Defensive Programming, protecting against bad data.

### Type Conversion Defeneses
Type conversion is very important core principle of SQL. Tables can store many different types and the reason for this is that different types use up different storage and at the same time allow for more flexibility in calculations.

SQL mainly built support for primitive types such as strings, integers and dates.

By definition strings can be any length of characters (numbers, letters or symbols) but because of limitations of storage in the early days of computing, in many databases strings are stored as either `CHAR(n)` which represents a fixed-length string of n characters or `VARCHAR(n)` which represents a variable-length string of characters.

Strings can be considered "universal" data types because anything can be stored as a string. Doing this is very useful when loading data into a table from a text file like a comma-delimited CSV or tab-delimited TSV. If you try to load data in at the correct type and there are errors in the file, you'll be dealing with a lot of anguish, so load as string first.

Once data is loaded in a table as strings, we can convert it to a more appropriate type and handle the errors. The standard function for converting data in SQL is `CAST()` Some other database implementations like SQL Server also use a custom function called `CONVERT()`. We can use `CAST()` to both convert between types (like string to date) or within the same type (like a timestamp to date)

Here's an example of how type conversion works:
```
SELECT CAST('2021-12-01' as DATE);

dt        |
----------+
2021-12-01|
```

Suppose that for whatever reason the date was bad:
```
SELECT CAST('2021-12-01' as DATE);

Error: Could not cast literal "2021-13-01" to type DATE at [1:13]
```
Obviously there's no 13th month so BigQuery throws an error.

Same thing happens if the formatting was bad:
```
SELECT CAST('2021-12--01' as DATE);

Message: Could not cast literal "2021-12--01" to type DATE at [1:13]
```
The extra dash in this case messes up conversion.

Same types of things happen if you try to convert a string to a number and the formatting is malformed or the data is not a number. So how do you deal with these issues?

### Ignore the Error Pattern
One of the easiest ways to deal with these issues is to simply ignore the malformed data. However the `CAS()` function will fail if it encounters an issue and we want our query to be robust.

To deal with this problem many databases introduce "safe" casting functions like `SAFE_CAST()` in BigQuery or `TRY_CAST()` in SQL Server. These functions will not fail when the formatting is unexpected but rather return `NULL` which then allows us to use `IFNULL()` or `COALESCE()` to replace `NULL` with a sensible value.

Here's how that works:
```
SELECT SAFE_CAST('2021-12--01' as DATE) AS dt;

    dt|
------+
 NULL |
```
Now we can apply any of the functions that deal with `NULL` and replace it or just leave it. 
```
SELECT IFNULL(SAFE_CAST('2021-' as INTEGER), 0) AS num;

num|
---+
  0|
```

### Force Formatting Pattern
While ignoring incorrect data is easy, you can't always get away with it. Sometimes you need to extract the valuable data from the incorrect format. This is the time when you need to look for repeating patterns in the incorrect data and force the formatting.

Here's a few examples: Suppose that all dates had extra dashes like this:
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

What if you have multiple types of regularities in your data? In some cases if information is aggregated from multiple sources you might have to deal with multiple types of formatting.

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
Obviously we can't force the same format for all the dates here so we'll have to split this up and apply the force formatting pattern separately as long as we can detect the right patterns:
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
As you can see in this example what we're doing is separating each pattern via a `CASE` statement and handling each one differently. You can repeat this pattern as many times as you want to handle each case.

### Expect NULLs
This pattern can and should be used at any time even when you think the data is clean. Basically whenever you're doing a `LEFT JOIN` or type conversion you should be expecting NULLs and protecting against them as a defensive measure. This is done to make sure that even if your data ever gets messy your query will not fail. It's simply the use of `IFNULL()` or `COALESCE()` everywhere in your select.

NULLs in SQL represent unknown values. While the data may appear to be blank or empty, it's not the same as an empty string or white space. You cannot compare NULLs to anything directly, for example you cannot say:
```
SELECT col1
FROM table
WHERE col2 = NULL;
```

You get `NULL` when you try to perform any type of calculation with `NULL` like adding or subtracting, multiplying or dividing because adding anything to an unknown value is still unknown. SQL deals with NULLs by using the `IS` keyword. `IS NULL` literally means is unknown. `IFNULL()` then means if this is unknown.

So in order to protect against unexpected NULLs it's often a good idea for your production queries to wrap `IFNUL()` around all the fields.
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
SELECT IFNULL(SAFE_CAST(
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

This is the same query as above but implemented using "defensive coding" where we expect junk dates (like `13/05/2021`) and we replace with a fixed date `1900-01-01` This way our query will not fail and afterwards we can investigate why the data was junk.

### Start With a LEFT JOIN
One of the ways you'll get NULLs in your results is when you use a `LEFT JOIN`. Now there are legitimate reasons to use a `LEFT JOIN`, like when you know for sure the data will be missing on the right table but in this case we're using it deliberately to avoid restricting the final results.

Whenever we use `INNER JOIN` the final result is always reduced down to just the matching rows from both tables. This means that if the history table has some strange `user_id` that doesn't exist in the `users` table, they will not show up in the final result. The same happens with the `users` that have no activity in `post_history`

For the purposes of our project, we only want the active users so an `INNER JOIN` is very appropriate here. If we wanted everyone, we'd have to user a `LEFT JOIN` So why am I saying you should start with a `LEFT JOIN`? Get burned too many times and you eventually learn your lesson.

The mantra I keep repeating here is "real world data is messy" There are missing rows, duplicate rows, incorrect types and so on. Unless you know your data well and it's being carefully monitored for these things, you should consider them in your joins.

### Dealing with divide by zero
Whenever you need to calculate ratios you always have to worry about division by zero. Going back to our principle of defensive programming, it makes sense to explicitly handle cases where the denominator can be zero.

The easiest way to handle this is by excluding zero values in the where clause as we do in our query
```
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
This will work fine in most cases but what if you're calculating multiple ratios and you don't want to restrict the data for each one? One way to handle this is by using a `CASE` statement like this:
```
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
This looks good and is pretty clean but not as elegant. BigQuery offers another way we can do this more cleanly. Just like the `SAFE_CAST()` function, it has a `SAFE_DIVIDE()` function which returns `NULL` in the case of divide-by-zero error. Then you can simply deal with the `NULL` value using `IFNULL()`
```
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
Now that's far more elegant isn't it?  Snowflake also implements a similar function they call `DIV()` which automatically returns 0 if there's a division by zero error eschewing the need for `IFNULL()` If your database has these functions, I highly recommend you use them.

### Dealing with messy strings
I said earlier that strings are the easiest way to store any kind of data (numbers, dates, strings) but strings also have their own issues, especially when you're trying to join on a string field.

Here are some issues you'll undoubtedly run into with strings. 
1. Inconsistent casing
2. Space padding
3. Non-ASCII characters

Many databases are case sensitive so if the same string is stored with different cases it will not match when doing a join. Let's see an example:
```
SELECT 'string' = 'String' AS test;

test |
-----+
false|
```

As you can see, a different case causes the test to show as `FALSE` The only way to deal with this problem when joining on strings or matching patterns on a string is to convert all fields to upper or lower case.
```
SELECT lower('string') = lower('String') AS test;

test|
----+
true|
```

Space padding is the other common issue you deal with strings.
```
SELECT 'string' = ' string' AS test;

test |
-----+
false|
```

You deal with this by using the `TRIM()` function which removes all the leading and trailing spaces.
```
SELECT trim('string') = trim(' string') AS test;

test|
----+
true|
```