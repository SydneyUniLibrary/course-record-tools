"use strict"

/*
  Copyright (C) 2017  The University of Sydney Library

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/


const _ = require('lodash')
const _fp = require('lodash/fp')
const csv = require('csv')
const fs = require('fs')
const sierraDb = require('@sydneyunilibrary/sierra-db-as-promised')()


const optionDefinitions = [
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: [
      'Print the synopsis and usage, and then exit without doing anything.',
    ].join(' '),
  },
  {
    name: 'skip',
    type: Number,
    defaultValue: 1,
    description: [
      'The number of lines in the input file before the actual data starts.',
      'Defaults to 1.'
    ].join(' '),
  },
  {
    name: 'column',
    alias: 'c',
    type: Number,
    defaultValue: 1,
    description: [
      'Which column number of the input file contains the course record numbers.',
      'The first column is column number 1. Defaults to 1.' ,
    ].join(' '),
  },
  {
    name: 'result-column',
    alias: 'r',
    type: Number,
    defaultValue: 0,
    description: [
      'Which column number to put the UOS codes into. Defaults to 0.',
      'If 0, the UOS codes are inserted into a new column at the start of each row.',
      'If not 0, then only rows with a blank cell in this column will be processed;',
      'and rows with a non-blank cell will be left as is.',
    ].join(' '),
  },
  {
    name: 'input-file',
    type: String,
    defaultOption: true,
    typeLabel: '<file>',
    description: [
      'The path to a utf-8 csv file that has the course record numbers.',
      '"-" means standard input. Defaults to "-".',
    ].join(' '),
  }
]


const usage = [
  {
    header: 'NAME',
    content: [
      'find-uos-code.js - Find the the unit of study codes for a list of course record numbers',
    ],
  },
  {
    header: 'SYNOPSIS',
    content: 'node find-uos-codes.js [options] [<file>]',
  },
  {
    header: 'DESCRIPTION',
    content: [
      [
        '<file>, if given, should be the path to a utf-8 csv file with course record numbers in the first column.',
        'If <file> is not given, standard input is used instead.',
      ].join(' '),
      '',
      [
        'If the course record numbers are not in the first column of the input file, use the -c/--column option',
        'to specify which column has the barcodes.',
      ].join(' '),
    ],
  },
  {
    header: 'OPTIONS',
    optionList: optionDefinitions,
  },
  {
    header: 'UNIT OF STUDY CODES',
    content: [
      [
        'For each course record number, the COURSE fields (field tag r) are searched.',
        'A unit of study code is anything being four uppercase leters, followed possibly by some amount of whitespace, followed by four numbers.',
        'All the COURSE fields are searched and then the results are deduplicated.',
        'If there is only one unit of study code found, this is the result.',
        'If there are multiple unit of study codes found, they are separated by commas and output as the result.',
        'If no unit of study codes are found, then the first COURSE field is output as the result.',
        'If there are no COURSE fields found, then the course record number is output as the result.',
      ].join(' '),
    ],
  },
  {
    header: 'COURSE RECORD NUMBERS',
    content: [
      [
        'The course record numbers must not have the check digit. Valid examples are: r1006349, r1006370.',
        'Any extraneous characters like semicolons or quotes are ignored.',
      ].join(' '),
    ],
  },
  {
    header: 'MULTIPLE COURSE RECORD NUMBERS',
    content: [
      [
        'There can be multple course record numbers in a cells.',
        'The output column will have a search result for each course record number, separated by a comma.',
      ].join(' '),
    ],
  },
]


const options = require('command-line-args')(optionDefinitions)
if (options.help) {
  console.log(require('command-line-usage')(usage))
  process.exit(-1)
}


const recordNumberColumn = _.max([ options.column - 1, 0 ])
const resultColumn = _.max([ options['result-column'] - 1, -1 ])
const wantsPrependedResults = resultColumn === -1


function loadInputFile() {
  return new Promise((resolve, reject) => {
    try
    {

      let inputData = []
      let inputFilePath = options['input-file'] || '-'

      let csvParseStream = csv.parse()
      csvParseStream
      .on('error', (err) => {
        reject(err)
      })
      .on('end', () => {
        resolve({inputData})
      })
      .on('data', data => {
        inputData.push({ cells: data })
      })

      let inputFileStream =
        inputFilePath === '-'
        ? process.stdin
        : fs.createReadStream(options['input-file'], { encoding: 'utf-8' })
      inputFileStream
      .on('error', (err) => reject(err))
      .pipe(csvParseStream)

    } catch (err) {
      reject(err)
    }
  })
}


function augmentInputDataWithRecordNumbers(state) {
  const { inputData } = state

  let rowsToProcess = _.drop(inputData, options.skip)
  if (! wantsPrependedResults) {
    rowsToProcess = _.reject(rowsToProcess, x => x.cells[resultColumn])
  }

  const recordNumberRegEx = /r(\d{7})/g
  for (let x of rowsToProcess) {
    x.recordNumbers = x.cells[recordNumberColumn].match(recordNumberRegEx)
  }

  return state
}


async function findUosCode(state) {
  const { inputData } = state

  let mapping = new Map()

  let uniqSetOfRecordNumbers =
    _fp.flow(
      _fp.map(x => x.recordNumbers),
      _fp.filter(_fp.identity),
      _fp.flattenDeep,
      _fp.sortBy(_fp.identity),
      _fp.sortedUniq,
    )(inputData)

  const uosCodeRegEx = /([A-Z]{4}\s*[0-9]{4})/g
  await sierraDb.task(async t => {
    for (let recordNumber of uniqSetOfRecordNumbers) {
      const courseFields = await t.any(
        `
           SELECT v.field_content
             FROM varfield AS v
                  JOIN record_metadata AS md ON md.id = v.record_id
            WHERE v.varfield_type_code = 'r'
                  AND md.record_type_code = 'r'
                  AND md.record_num = $1
        `,
        recordNumber.substr(1)
      )

      const uosCodes =
        _fp.flow(
          _fp.map(x => x.field_content.match(uosCodeRegEx)),
          _fp.filter(_fp.identity),  // Remove nulls caused by no matches
          _fp.flattenDeep,
          _fp.map(x => x.replace(' ', '')),
          _fp.sortBy(_fp.identity),
          _fp.sortedUniq,
        )(courseFields)

      mapping.set(
        recordNumber,
        uosCodes.length > 0
        ? uosCodes
        : courseFields.length > 0
        ? courseFields[0].field_content
        : recordNumber
      )
    }
  })

  return Object.assign({}, state, { mapping })
}


function augmentInputDataWithResults(state) {
  const { inputData, mapping } = state

  let rowsToProcess = _.filter(inputData, x => x.recordNumbers)

  for (let row of rowsToProcess) {
    row.results =
      _fp.flow(
        _fp.map(x => mapping.get(x)),
        _fp.flattenDeep,
        _fp.uniq,
      )(row.recordNumbers)
  }

  return state
}


function outputInExistingColumn(state) {
  return new Promise((resolve, reject) => {
    try {

      const { inputData, mapping } = state

      let csvStringify = csv.stringify()
      csvStringify.on('finish', () => resolve(state))
      csvStringify.pipe(process.stdout)

      for (let x of _.take(inputData, options.skip)) {
        csvStringify.write([ '', ...x.cells ])
      }
      for (let x of _.drop(inputData, options.skip)) {
        if (x.results) {
          let y = [ ...x.cells ]
          y[resultColumn] = x.results.join(', ')
          csvStringify.write(y)
        } else {
          csvStringify.write(x.cells)
        }
      }
      csvStringify.end()

    } catch (err) {
      reject(err)
    }
  })
}


function outputInNewColumn(state) {
  return new Promise((resolve, reject) => {
    try {

      const { inputData, mapping } = state

      let csvStringify = csv.stringify()
      csvStringify.on('finish', () => resolve(state))
      csvStringify.pipe(process.stdout)

      for (let x of _.take(inputData, options.skip)) {
        csvStringify.write(x.cells)
      }
      for (let x of _.drop(inputData, options.skip)) {
        csvStringify.write(
          x.results
          ? [ x.results.join(', '), ...x.cells ]
          : [ '', ...x.cells ]
        )
      }
      csvStringify.end()

    } catch (err) {
      reject(err)
    }
  })
}


function dumpState(state) {
  return new Promise((resolve, reject) => {
    try {
      console.dir(state, { colors: true, depth: null} )
      resolve(state)
    } catch (err) {
      reject(err)
    }
  })
}



loadInputFile()
.then(augmentInputDataWithRecordNumbers)
.then(findUosCode)
.then(augmentInputDataWithResults)
.then(wantsPrependedResults ? outputInNewColumn : outputInExistingColumn)
.then(() => process.exit(0))
.catch(err => {
  console.error(err)
  process.exit(1)
})
