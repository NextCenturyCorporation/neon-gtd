'use strict';
/*
 * Copyright 2014 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var neon = neon || {};
neon.query = neon.query || {};

/**
 * FilterTable manages a set of filter clauses to be used with Neon queries
 * where each row in the table represents a separate filter clause.  A single row
 * represents a field-operator-value combo.  For example, "total < 10".  This class
 * provides convenience functions for adding/removing rows or building a filter
 * table from more primitive data arrays.
 *
 * @example
 *    var filterRow = new FilterRow("myTable", "total", "<", 10);<br>
 *    var filterTable = new FilterTable();<br>
 *    filterTable.addFilterRow(filterRow);
 *
 * @class neon.query.FilterTable
 * @constructor
 */
neon.query.FilterTable = function() {
    this.filterKeys = {};
    this.columnOptions = [];
    this.operatorOptions = ["=", "!=", ">", "<", ">=", "<=", "contains", "not contains"];
    this.filterState = {};
};

/**
 * Initializes the filter state for the given database and table if necessary.
 * @param {String} databaseName
 * @param {String} tableName
 * @method initializeFilterStateForTable
 */
neon.query.FilterTable.prototype.initializeFilterStateForTable = function(databaseName, tableName) {
    if(!(this.filterState[databaseName])) {
        this.filterState[databaseName] = [];
    }
    if(!(this.filterState[databaseName][tableName])) {
        this.filterState[databaseName][tableName] = [];
    }
};

/**
 * Adds a FilterRow to the FilterTable for the given database and table and returns its index in the FilterTable.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @return {Number}
 * @method addFilterRow
 */
neon.query.FilterTable.prototype.addFilterRow = function(databaseName, tableName, row) {
    this.initializeFilterStateForTable(databaseName, tableName);
    this.filterState[databaseName][tableName].push(row);
    return this.filterState[databaseName][tableName].length - 1;
};

/**
 * Inserts a FilterRow at a particular index in the FilterTable for the given database and table.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @param {Number} index
 * @method insertFilterRow
 */
neon.query.FilterTable.prototype.insertFilterRow = function(databaseName, tableName, row, index) {
    this.initializeFilterStateForTable(databaseName, tableName);
    this.filterState[databaseName][tableName].splice(index, 1, row);
};

/**
 * Removes a FilterRow for the given database and table from the given row index and returns it.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {Number} id
 * @return {neon.query.FilterRow}
 * @method removeFilterRow
 */
neon.query.FilterTable.prototype.removeFilterRow = function(databaseName, tableName, id) {
    this.initializeFilterStateForTable(databaseName, tableName);
    return this.filterState[databaseName][tableName].splice(id, 1);
};

/**
 * Returns the FilterRow in the given database and table at the given index.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {Number} id
 * @return {neon.query.FilterRow}
 * @method getFilterRow
 */
neon.query.FilterTable.prototype.getFilterRow = function(databaseName, tableName, id) {
    this.initializeFilterStateForTable(databaseName, tableName);
    return this.filterState[databaseName][tableName][id];
};

/**
 * Sets the FilterRow in the given database and table at the given row index.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @param {Number} index
 * @return {neon.query.FilterRow}
 * @method setFilterRow
 */
neon.query.FilterTable.prototype.setFilterRow = function(databaseName, tableName, row, index) {
    this.filterState[databaseName][tableName][index] = row;
    return this.filterState[databaseName][tableName][index];
};

/**
 * Clears the state for the FilterTable, removing all rows from the given database and table, or all rows from the FilterTable if no database and table are given.
 * @param {String} databaseName (optional)
 * @param {String} tableName (optional)
 * @method clearFilterState
 */
neon.query.FilterTable.prototype.clearFilterState = function(databaseName, tableName) {
    if(databaseName && tableName) {
        delete this.filterState[databaseName][tableName];
    } else {
        this.filterState = {};
    }
};

/**
 * Clears the keys for given database and table in the FilterTable, or all keys in the FilterTable if no database and table are given.
 * @param {String} databaseName (optional)
 * @param {String} tableName (optional)
 * @method clearFilterKeys
 */
neon.query.FilterTable.prototype.clearFilterKeys = function(databaseName, tableName) {
    if(databaseName && tableName) {
        delete this.filterKeys[databaseName][tableName];
    } else {
        this.filterKeys = {};
    }
};

/**
 * Sets a filter key to use for the given database and table.
 * @param {String} databaseName
 * @param {String} tableName
 * @param {String} key
 * @method setFilterKey
 */
neon.query.FilterTable.prototype.setFilterKey = function(databaseName, tableName, key) {
    if(!(this.filterKeys[databaseName])) {
        this.filterKeys[databaseName] = {};
    }
    this.filterKeys[databaseName][tableName] = key;
};

/**
 * Returns a list of objects containing each database and table combination in the filter state.
 * @return {Array}
 * @method getTableNames
 */
neon.query.FilterTable.prototype.getDatabaseAndTableNames = function() {
    var nameObjects = [];

    var databases = Object.keys(this.filterState);
    for(var i = 0; i < databases.length; ++i) {
        var tables = Object.keys(this.filterState[databases[i]]);
        for(var j = 0; j < tables.length; ++j) {
            nameObjects.push({
                database: databases[i],
                table: tables[j]
            });
        }
    }

    return nameObjects;
};

/**
 * Returns the list of FilterRows in all tables in this FilterTable.
 * @return {Array}
 * @method getFilterRows
 */
neon.query.FilterTable.prototype.getFilterRows = function() {
    var allRows = [];
    var databases = Object.keys(this.filterState);
    for(var i = 0; i < databases.length; ++i) {
        var tables = Object.keys(this.filterState[databases[i]]);
        for(var j = 0; j < tables.length; ++j) {
            var rows = this.filterState[databases[i]][tables[j]];
            // Update the index in each FilterRow representing that row's index in the filter state for its corresponding database and table for the UI.
            for(var k = 0; k < rows.length; ++k) {
                rows[k].index = k;
            }
            allRows = allRows.concat(rows);
        }
    }
    return allRows;
};

/**
 * Returns the filter key for the given database and table in this FilterTable.
 * @param {String} databaseName
 * @param {String} tableName
 * @return {String}
 * @method getFilterKey
 */
neon.query.FilterTable.prototype.getFilterKey = function(databaseName, tableName) {
    return this.filterKeys[databaseName][tableName];
};

/**
 * Sets the filter state for the given database and table to the given data.
 * @param {String} databaseName
 * @param {String} tableName
 * @method setFilterState
 */
neon.query.FilterTable.prototype.setFilterState = function(databaseName, tableName, data) {
    this.filterState[databaseName][tableName] = data;
};

/**
 * Returns the filter state for the given database and table (the interal array of filter rows).
 * @param {String} databaseName
 * @param {String} tableName
 * @return {Object}  An object containing a data array of FilterRows.
 * @method getFilterState
 */
neon.query.FilterTable.prototype.getFilterState = function(databaseName, tableName) {
    this.initializeFilterStateForTable(databaseName, tableName);
    return this.filterState[databaseName][tableName];
};

/**
 * Builds a Neon Filter for each table in this FilterTable based on all of their FilterRows and returns the array of Filters.
 * @param {Boolean} andClauses True if the compound clause should 'AND' all the FilterRows; false
 *    if it should 'OR' all the FilterRows
 * @return {Array}
 * @method buildFiltersFromData
 */
neon.query.FilterTable.prototype.buildFiltersFromData = function(andClauses) {
    var filters = [];

    var databases = Object.keys(this.filterState);
    for(var i = 0; i < databases.length; ++i) {
        var databaseName = databases[i];
        var tables = Object.keys(this.filterState[databaseName]);
        for(var j = 0; j < tables.length; ++j) {
            var tableName = tables[j];
            var filter = neon.query.FilterTable.buildFilterFromData(databaseName, tableName, this.filterState[databaseName][tableName], andClauses);
            filters.push({
                databaseName: databaseName,
                tableName: tableName,
                filter: filter
            });
        }
    }

    return filters;
};

/**
 * Builds a Neon where clause suitable for use as a composite Filter for Neon Queries from the
 * FilterRow data contained in this FilterTable.
 * @param {String} databaseName The database to filter.
 * @param {String} tableName The table to filter.
 * @param {Array} data A data array of FilterRows
 * @param {Boolean} andClauses True if the compound clause should 'AND' all the FilterRows; false
 *    if it should 'OR' all the FilterRows
 * @return {neon.query.where}
 * @method buildFilterFromData
 */
neon.query.FilterTable.buildFilterFromData = function(databaseName, tableName, data, andClauses) {
    var baseFilter = new neon.query.Filter().selectFrom(databaseName, tableName);

    var whereClause;
    if(0 === data.length) {
        return baseFilter;
    }
    if(1 === data.length) {
        var filterData = data[0];
        whereClause = neon.query.where(filterData.columnValue.columnName, filterData.operatorValue, neon.query.FilterTable.parseValue(filterData.value));
    } else {
        whereClause = neon.query.FilterTable.buildCompoundWhereClause(data, andClauses);
    }
    return baseFilter.where(whereClause);
};

/**
 * Takes an array of FilterRows and builds a compound Neon where object suitable for
 * filtering Neon Queries.
 * @param {Array} data A data array of FilterRows
 * @param {Boolean} andClauses True if the compound clause should 'AND' all the FilterRows; false
 *    if it should 'OR' all the FilterRows
 * @return {neon.query.where}
 * @method buildCompoundWhereClause
 * @static
 */
neon.query.FilterTable.buildCompoundWhereClause = function(data, andClauses) {
    var whereClause;
    var clauses = [];

    $.each(data, function(index, filterData) {
        var clause = neon.query.where(filterData.columnValue.columnName, filterData.operatorValue, neon.query.FilterTable.parseValue(filterData.value));
        clauses.push(clause);
    });

    if(andClauses) {
        whereClause = neon.query.and.apply(this, clauses);
    } else {
        whereClause = neon.query.or.apply(this, clauses);
    }
    return whereClause;
};

/**
 * Takes a string value (e.g., input field value) and parses it to a float, null, or boolean, or string as
 * appropriate to work with the Neon Query API.
 * @param {String} value The value to parse
 * @return {String|Number|Boolean|null}
 * @method parseValue
 * @static
 */
neon.query.FilterTable.parseValue = function(value) {
    var retVal = value;

    if($.isNumeric(retVal)) {
        retVal = parseFloat(retVal);
    } else if('null' === retVal || "" === retVal) {
        retVal = null;
    } else if('""' === retVal) {
        retVal = "";
    } else if('false' === retVal) {
        retVal = false;
    } else if('true' === retVal) {
        retVal = true;
    } else if((retVal.charAt(0) === '"' && retVal.charAt(retVal.length-1) === '"') || (retVal.charAt(0) === "'" && retVal.charAt(retVal.length-1) === "'")) {
        retVal = retVal.substring(1, retVal.length-1);
    }

    return retVal;
};

/**
 * A FilterRow is a basic support object for a filter build application.  It stores the
 * minimum data elements required to build a Neon filter:  a database, a table, a column,
 * an operator, and a value.
 *
 * @example
 *    var filterRow = new FilterRow({name: "myDatabase", prettyName: "My Database"}, {name: "myTable", prettyName: "My Table"}, {columnName: "total", prettyName: "Total"}, "<", 10);
 *
 * @class neon.query.FilterRow
 * @constructor
 */
neon.query.FilterRow = function(database, table, columnValue, operatorValue, value, tableOptions, columnOptions, operatorOptions) {
    this.database = database;
    this.tableOptions = tableOptions || [];
    this.table = table;
    this.columnOptions = columnOptions || [];
    this.columnValue = columnValue;
    this.operatorOptions = operatorOptions || [];
    this.operatorValue = operatorValue;
    this.value = value;
    this.dirty = false;
    this.index = 0;
    this.isDate = false;
};
