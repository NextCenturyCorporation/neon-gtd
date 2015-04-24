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
    this.operatorOptions = ["=", "!=", ">", "<", ">=", "<=", "contains"];
    this.filterState = {};
};

/**
 * Initializes the filter state for the given table if necessary.
 * @param {String} tableName
 * @method initializeFilterStateForTable
 */
neon.query.FilterTable.prototype.initializeFilterStateForTable = function(tableName) {
    if(!(this.filterState[tableName])) {
        this.filterState[tableName] = [];
    }
};

/**
 * Adds a FilterRow to the FilterTable for the given table and returns its index in the FilterTable.
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @return {Number}
 * @method addFilterRow
 */
neon.query.FilterTable.prototype.addFilterRow = function(tableName, row) {
    this.initializeFilterStateForTable(tableName);
    this.filterState[tableName].push(row);
    return this.filterState[tableName].length - 1;
};

/**
 * Inserts a FilterRow at a particular index in the FilterTable for the given table.
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @param {Number} index
 * @method insertFilterRow
 */
neon.query.FilterTable.prototype.insertFilterRow = function(tableName, row, index) {
    this.initializeFilterStateForTable(tableName);
    this.filterState[tableName].splice(index, 1, row);
};

/**
 * Removes a FilterRow for the given table from the given row index and returns it.
 * @param {String} tableName
 * @param {Number} id
 * @return {neon.query.FilterRow}
 * @method removeFilterRow
 */
neon.query.FilterTable.prototype.removeFilterRow = function(tableName, id) {
    this.initializeFilterStateForTable(tableName);
    return this.filterState[tableName].splice(id, 1);
};

/**
 * Returns the FilterRow in the given table at the given index.
 * @param {String} tableName
 * @param {Number} id
 * @return {neon.query.FilterRow}
 * @method getFilterRow
 */
neon.query.FilterTable.prototype.getFilterRow = function(tableName, id) {
    this.initializeFilterStateForTable(tableName);
    return this.filterState[tableName][id];
};

/**
 * Sets the FilterRow in the given table at the given row index.
 * @param {String} tableName
 * @param {neon.query.FilterRow} row
 * @param {Number} index
 * @return {neon.query.FilterRow}
 * @method setFilterRow
 */
neon.query.FilterTable.prototype.setFilterRow = function(tableName, row, index) {
    this.filterState[tableName][index] = row;
    return this.filterState[tableName][index];
};

/**
 * Clears the state for the FilterTable, removing all rows from the given table, or all rows from the FilterTable if no table is given.
 * @param {String} tableName (optional)
 * @method clearFilterState
 */
neon.query.FilterTable.prototype.clearFilterState = function(tableName) {
    if(tableName) {
        delete this.filterState[tableName];
    } else {
        this.filterState = {};
    }
};

/**
 * Clears the keys for given table in the FilterTable, or all keys in the FilterTable if no table is given.
 * @param {String} tableName (optional)
 * @method clearFilterKeys
 */
neon.query.FilterTable.prototype.clearFilterKeys = function(tableName) {
    if(tableName) {
        delete this.filterKeys[tableName];
    } else {
        this.filterKeys = {};
    }
};

/**
 * Sets a filter key to use for the given table.
 * @param {String} tableName
 * @param {String} key
 * @method setFilterKey
 */
neon.query.FilterTable.prototype.setFilterKey = function(tableName, key) {
    this.filterKeys[tableName] = key;
};

/**
 * Returns the list of tables in the filter state.
 * @return {Array}
 * @method getTableNames
 */
neon.query.FilterTable.prototype.getTableNames = function() {
    return Object.keys(this.filterState);
};

/**
 * Returns the list of FilterRows in all tables in this FilterTable.
 * @return {Array}
 * @method getFilterRows
 */
neon.query.FilterTable.prototype.getFilterRows = function() {
    var rows = [];
    var tables = Object.keys(this.filterState);
    for(var i = 0; i < tables.length; ++i) {
        rows = rows.concat(this.filterState[tables[i]]);
    }
    return rows;
};

/**
 * Sets the "and clauses" setting for all FilterRows in the given table to the given value.
 * @param {String} tableName
 * @param {Boolean} andClauses True if the compound clause should 'AND' all the FilterRows; false
 *    if it should 'OR' all the FilterRows
 * @method setAndClauses
 */
neon.query.FilterTable.prototype.setAndClauses = function(tableName, andClauses) {
    this.initializeFilterStateForTable(tableName);
    var rows = this.filterState[tableName];
    for(var i = 0; i < rows.length; ++i) {
        rows.andClauses = andClauses;
    }
};

/**
 * Returns the filter key for the given table in this FilterTable.
 * @param {String} tableName
 * @return {String}
 * @method getFilterKey
 */
neon.query.FilterTable.prototype.getFilterKey = function(tableName) {
    return this.filterKeys[tableName];
};

/**
 * Sets the filter state for the given table to the given data.
 * @param {String} tableName
 * @method setFilterState
 */
neon.query.FilterTable.prototype.setFilterState = function(tableName, data) {
    this.filterState[tableName] = data;
};

/**
 * Returns the filter state for the given table (the interal array of filter rows).
 * @param {String} tableName
 * @return {Object}  An object containing a data array of FilterRows.
 * @method getFilterState
 */
neon.query.FilterTable.prototype.getFilterState = function(tableName) {
    this.initializeFilterStateForTable(tableName);
    return this.filterState[tableName];
};

/**
 * Builds a Neon Filter for each table in this FilterTable based on all of their FilterRows and returns the array of Filters.
 * @param {String} databaseName The database to filter.
 * @return {Array}
 * @method buildFiltersFromData
 */
neon.query.FilterTable.prototype.buildFiltersFromData = function(database) {
    var filters = [];

    var tables = Object.keys(this.filterState);
    for(var i = 0; i < tables.length; ++i) {
        var tableName = tables[i];
        var filter = neon.query.FilterTable.buildFilterFromData(database, tableName, this.filterState[tableName]);
        filters.push({
            tableName: tableName,
            filter: filter
        });
    }

    return filters;
};

/**
 * Builds a Neon where clause suitable for use as a composite Filter for Neon Queries from the
 * FilterRow data contained in this FilterTable.
 * @param {String} databaseName The database to filter.
 * @param {String} tableName The table to filter.
 * @param {Array} data A data array of FilterRows
 * @return {neon.query.where}
 * @method buildFilterFromData
 */
neon.query.FilterTable.buildFilterFromData = function(databaseName, tableName, data) {
    var baseFilter = new neon.query.Filter().selectFrom(databaseName, tableName);

    var whereClause;
    if(0 === data.length) {
        return baseFilter;
    }
    if(1 === data.length) {
        var filterData = data[0];
        whereClause = neon.query.where(filterData.columnValue, filterData.operatorValue, neon.query.FilterTable.parseValue(filterData.value));
    } else {
        whereClause = neon.query.FilterTable.buildCompoundWhereClause(data);
    }
    return baseFilter.where(whereClause);
};

/**
 * Takes an array of FilterRows and builds a compound Neon where object suitable for
 * filtering Neon Queries.
 * @param {Array} data A data array of FilterRows
 * @return {neon.query.where}
 * @method buildCompoundWhereClause
 * @static
 */
neon.query.FilterTable.buildCompoundWhereClause = function(data) {
    var whereClause;
    var clauses = [];
    var andClauses = true;

    $.each(data, function(index, filterData) {
        var clause = neon.query.where(filterData.columnValue, filterData.operatorValue, neon.query.FilterTable.parseValue(filterData.value));
        clauses.push(clause);
        // The value of andClauses should be the same for all FilterRows for a table.
        andClauses = filterData.andClauses;
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
    }
    return retVal;
};

/**
 * A FilterRow is a basic support object for a filter build application.  It store the
 * minimum data elements required to build a Neon filter: a table, a column to act upon,
 * the operator for comparison, and a value to compare against.
 *
 * @example
 *    var filterRow = new FilterRow("myTable", "total", "<", 10);
 *
 * @class neon.query.FilterRow
 * @constructor
 */
neon.query.FilterRow = function(tableName, columnValue, operatorValue, value, andClauses, columnOptions, operatorOptions) {
    this.tableName = tableName;
    this.columnOptions = columnOptions || [];
    this.columnValue = columnValue;
    this.operatorOptions = operatorOptions || [];
    this.operatorValue = operatorValue;
    this.value = value;
    this.andClauses = typeof andClauses === "undefined" ? true : andClauses;
    this.dirty = false;
};
