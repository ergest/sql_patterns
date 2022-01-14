Using a single CTE to refactor logic or make code more readable and maintainable
```
with CTE1 as (
	select * from table1
)

select * from CTE1 
)
```

Using multiple CTE in series to break down a query

```
with CTE1 as (
	select * from table1
),

CTE2 as (
	select * from table2
),

select * 
from CTE1 
join CTE2
```