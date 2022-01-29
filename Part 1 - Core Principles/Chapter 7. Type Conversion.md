Type conversion is another important core principle of SQL. Tables can store many different types and the reason for this is that different types use up different storage and at the same time allow for more flexibility in calculations.

SQL mainly built support for primitive types such as strings, integers and dates.

#### Strings
By definition strings can be any length of characters (numbers, letters or symbols) but because of limitations of storage in the early days of computing, in many databases strings are stored as either `CHAR(n)` which represents a fixed-length string of n characters or `VARCHAR(n)` which represents a variable-length string of characters.

Strings can be considered "universal" data types because anything can be stored as a string. Doing this is very useful when loading data into a table from a text file like a comma-delimited CSV or tab-delimited TSV.

You can try to load data into the specific type (like numbers to a numeric type field) but real world data is messy and you'll be fighting with data conversion errors. Strings, being a simple collection of characters are more forgiving of cases where you might have letters in a numeric field, weird formatting in a date field, etc. 

Once data is loaded in a table as strings, we can convert it to a more appropriate type and handle the errors. The standard function for converting data in SQL is `CAST()` Some other database implementations like SQL Server also use a custom function called `CONVERT()`. We can use `CAST()` to both convert between types (like string to date) or within the same type (like a timestamp to date)

Here's an example of how type conversion works:
```
select
    c.user_id,
    cast(c.creation_date as date) as creation_date,
	cast(p.favorite_count as integer) as favorite_count,
    count(*) as total_comments
from
    `bigquery-public-data.stackoverflow.comments` c
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
group by
    1, 2, 3
```

In this query we're doing two types of conversions. We're converting a timestamp into a date in order to truncate the time information and we're converting a string into an integer. Note that the type names `string` and `integer` are unique to BigQuery. Different systems might have different types.

#### Dealing with conversion errors
As we convert strings into numbers or dates we'll inevitably run into malformed data. This can be anything from unexpected characters in the data to completely unexpected formatting. In all these cases `CAST()` will fail and break your query. So how do you handle it?

To deal with this problem many databases introduce "safe" casting functions like `SAFE_CAST()` in BigQuery or `TRY_CAST()` in SQL Server. These functions will not fail when the formatting is unexpected but rather return `NULL` which then allows us to use `IFNULL()` or `COALESCE()` to replace `NULL` with a sensible value.

We only need a safe casting function if you're converting from string into a number or date because If the data is already stored as a number or date, converting to a string is always going to succeed.

Here's an example:
```
select
	id as post_id,
	p.creation_date,
	ifnull(safe_cast(p.favorite_count as integer), 0) as favorite_count,
	'answer' as post_type,
	p.score as post_score
from
	`bigquery-public-data.stackoverflow.posts_answers` p
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
```

In this case we're combining a `SAFE_CAST()` with `ISNULL()` so that if the conversion fails for whatever reason, I always get a zero.