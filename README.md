# course-records-tools
A collection of tools for working with Sierra course records.



## Getting started

```
git clone https://github.com/SydneyUniLibrary/course-record-tools.git
cd course-record-tools
npm install
```

Create a .env file inside the course-record-tools directory (next to the pacakge.json file), like the following.

```
SIERRA_DB_HOST=sierra.library.edu
SIERRA_DB_USER=me
SIERRA_DB_PASSWORD=secret
```

> **Never** commit this .env file into a source control repository.



## Find unit of study codes

```
NAME

  find-uos-code.js - Find the the unit of study codes for a list of course
  record numbers

SYNOPSIS

  node find-uos-codes.js [options] [<file>]

DESCRIPTION

  <file>, if given, should be the path to a utf-8 csv file with course record
  numbers in the first column. If <file> is not given, standard input is used
  instead.

  If the course record numbers are not in the first column of the input file,
  use the -c/--column option to specify which column has the barcodes.

OPTIONS

  -h, --help                   Print the synopsis and usage, and then exit without doing anything.
  --skip number                The number of lines in the input file before the actual data starts. Defaults
                               to 1.
  -c, --column number          Which column number of the input file contains the course record numbers. The
                               first column is column number 1. Defaults to 1.
  -r, --result-column number   Which column number to put the UOS codes into. Defaults to 0. If 0, the UOS
                               codes are inserted into a new column at the start of each row. If not 0, then
                               only rows with a blank cell in this column will be processed; and rows with
                               a non-blank cell will be left as is.
  --input-file <file>          The path to a utf-8 csv file that has the course record numbers. "-" means
                               standard input. Defaults to "-".

UNIT OF STUDY CODES

  For each course record number, the COURSE fields (field tag r) are searched.
  A unit of study code is anything being four uppercase leters, followed
  possibly by some amount of whitespace, followed by four numbers. All the
  COURSE fields are searched and then the results are deduplicated. If there is
  only one unit of study code found, this is the result. If there are multiple
  unit of study codes found, they are separated by commas and output as the
  result. If no unit of study codes are found, then the first COURSE field is
  output as the result. If there are no COURSE fields found, then the course
  record number is output as the result.

COURSE RECORD NUMBERS

  The course record numbers must not have the check digit. Valid examples are:
  r1006349, r1006370. Any extraneous characters like semicolons or quotes are
  ignored.

MULTIPLE COURSE RECORD NUMBERS

  There can be multple course record numbers in a cells. The output column will
  have a search result for each course record number, separated by a comma.
```
