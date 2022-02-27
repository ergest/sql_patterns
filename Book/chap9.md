## Chapter 9: Miscellaneous Patterns

### Window Functions
Duplicate rows are the biggest nuisance in the field of data. That's because as we saw in Chapter 2, when you join duplicate rows, your counts get multiplied. Unless you can fix the underlying data, dealing with duplicates is something you'll have to do often.

We've already seen a pattern for doing this through aggregation using `GROUP BY` so here I'll cover another pattern which often comes up in other situations as well. This pattern uses the `ROW_NUMER()` window function, which creates an index for each row and allows you to choose the lowest/highest value.


### Reference Table Filtering
### Regular Expressions
### JSON Parsing
### String Manipulation
