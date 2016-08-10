'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

angular.module("neonDemo.services")
.factory("FilterService", ["DatasetService", "ErrorNotificationService", function(datasetService, errorNotificationService) {
    var service = {};

    service.filters = [];

    // The beginning of the filter builder filter name to ignore when searching for filters
    service.filterBuildPrefix = "Filter Builder";

    service.messenger = new neon.eventing.Messenger();

    /*
     * Gets all the filters from the server.
     * @param {Function} [successCallback] Optional success callback
     * @method getFilterState
     */
    service.getFilterState = function(successCallback, errorCallback) {
        neon.query.Filter.getFilterState('*', '*', function(filters) {
            service.filters = filters;
            if(successCallback) {
                successCallback();
            }
        }, function(response) {
            if(errorCallback) {
                errorCallback(response);
            } else if(response.responseJSON) {
                errorNotificationService.showErrorMessage(null, response.responseJSON.error);
            }
        });
    };

    /*
     * Adds a filter with the given database, table, and attributes. If exists, the filter gets replaced.
     * @param {Object} messenger The messenger object used to add the filters
     * @param {String} database The name of the database to create a filter on
     * @param {String} table The name of the table to create a filter on
     * @param {Array} attributes A list of field names to create a filter on
     * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
     *  <ul>
     *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
     *      <li> {String} or {Array} The field name(s) </li>
     *  </ul>
     * @param {String} or {Object} filterName The name of the visualization or an object containing {String} visName and {String} text
     * @param {Function} successCallback The function called once all the filters have been added (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @method addFilter
     */
    service.addFilter = function(messenger, database, table, attributes, createFilterClauseFunction, filterName, successCallback, errorCallback) {
        var filters = service.getFilters(database, table, attributes);
        var relations = datasetService.getRelations(database, table, attributes);

        if(filters.length) {
            replaceFilter(messenger, relations, createFilterClauseFunction, getFilterNameString(filterName, relations), successCallback, errorCallback);
        } else {
            addNewFilter(messenger, relations, createFilterClauseFunction, getFilterNameString(filterName, relations), successCallback, errorCallback);
        }
    };

    /*
     * Removes a filter with the given database, table, and attributes.
     * @param {String} database The name of the database
     * @param {String} table The name of the table
     * @param {Array} attributes A list of field names
     * @param {Function} successCallback The function called once all the filters have been removed (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @param {Object} messenger The messenger object used to remove the filters (optional)
     * @method removeFilter
     */
    service.removeFilter = function(database, table, attributes, successCallback, errorCallback, messenger) {
        var relations = datasetService.getRelations(database, table, attributes);
        var filterKeys = getRelationsFilterKeys(relations);
        if(filterKeys.length) {
            if(messenger) {
                removeFilters(messenger, filterKeys, successCallback, errorCallback);
            } else {
                removeFilters(service.messenger, filterKeys, successCallback, errorCallback);
            }
        } else if(successCallback) {
            successCallback();
        }
    };

    /*
     * Replaces a filter with the given filter key.
     * @param {Object} messenger The messenger object used to replace the filter
     * @param {String} filterKey A filter key of the filter to replace
     * @param {Object} filter The filter clause
     * @param {Function} successCallback The function called once the filter has been replaced (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @method replaceFilterForKey
     */
    service.replaceFilterForKey = function(messenger, filterKey, filter, successCallback, errorCallback) {
        service.messenger.replaceFilter(filterKey, filter, function() {
            var index = _.findIndex(service.filters, {
                id: filterKey
            });

            if(index === -1) {
                service.filters.push({
                    id: filterKey,
                    dataSet: {
                        databaseName: filter.databaseName,
                        tableName: filter.tableName
                    },
                    filter: filter
                });
            } else {
                service.filters[index] = {
                    id: filterKey,
                    dataSet: {
                        databaseName: filter.databaseName,
                        tableName: filter.tableName
                    },
                    filter: filter
                };
            }

            if(successCallback) {
                successCallback();
            }
        }, errorCallback);
    };

    /*
     * Removes the filters with the given filter keys.
     * @param {Array} filterKeys A list of filter keys of the filters to remove
     * @param {Function} successCallback The function called once all the filters have been removed (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @method removeFiltersForKeys
     */
    service.removeFiltersForKeys = function(filterKeys, successCallback, errorCallback) {
        if(filterKeys.length) {
            removeFilters(service.messenger, filterKeys, successCallback, errorCallback);
        } else if(successCallback) {
            successCallback();
        }
    };

    /*
     * Finds the filter key that matches the given database, table, and filter clause.
     * @param {String} databaseName The name of the database
     * @param {String} tableName The name of the table
     * @param {Object} filterClause The filter clause
     * @param {Boolean} includeAllFilters If false, ignores any filters whose name starts with the
     * filterBuildPrefix variable. Otherwise it searches all filters.
     * @method getFilterKey
     * @return The filter key matching the given filter, or undefined if no filter was found.
     */
    service.getFilterKey = function(databaseName, tableName, filterClause, includeAllFilters) {
        for(var i = 0; i < service.filters.length; i++) {
            if(databaseName === service.filters[i].filter.databaseName &&
                tableName === service.filters[i].filter.tableName &&
                (includeAllFilters || service.filters[i].filter.filterName.indexOf(service.filterBuildPrefix) !== 0) &&
                service.areClausesEqual(service.filters[i].filter.whereClause, filterClause)) {
                return service.filters[i].id;
            }
        }
        return undefined;
    };

    /*
     * Returns the list of filters.
     * @method getAllFilters
     */
    service.getAllFilters = function() {
        return service.filters;
    };

    /*
     * Returns the filters that match the given database, table, and attributes.
     * @param {String} database The database name
     * @param {String} table The table name
     * @param {Array} attributes The list of field names
     * @param {Boolean} includeAllFilters If false, ignores any filters whose name starts with the
     * filterBuildPrefix variable. Otherwise it searches all filters.
     * @method getFilters
     * @return {Array}
     */
    service.getFilters = function(database, table, attributes, includeAllFilters) {
        var checkClauses = function(clause) {
            if(clause.type === "where" && attributes.indexOf(clause.lhs) >= 0) {
                return true;
            } else if(clause.type !== "where") {
                for(var i = 0; i < clause.whereClauses.length; i++) {
                    if(!checkClauses(clause.whereClauses[i])) {
                        return false;
                    }
                }
                return true;
            }
        };

        var filters = [];
        service.filters.forEach(function(filter) {
            if((includeAllFilters || filter.filter.filterName.indexOf(service.filterBuildPrefix) !== 0) && filter.dataSet.databaseName === database && filter.dataSet.tableName === table &&
                checkClauses(filter.filter.whereClause)) {
                filters.push(filter);
            }
        });

        return filters;
    };

    /*
     * Checks if the two filter clauses are equal.
     * @param {Object} firstClause
     * @param {Object} secondClause
     * @method areClausesEqual
     * @return {Boolean}
     */
    service.areClausesEqual = function(firstClause, secondClause) {
        var clausesEqual = function(first, second) {
            if(first.lhs === second.lhs && first.operator === second.operator && first.rhs === second.rhs) {
                return true;
            } else if((_.isDate(firstClause.rhs) || _.isDate(secondClause.rhs)) &&
                new Date(first.rhs).valueOf() === new Date(second.rhs).valueOf()) {
                return true;
            }
            return false;
        };

        if(firstClause.type === secondClause.type) {
            if(firstClause.type === "where") {
                return clausesEqual(firstClause, secondClause);
            } else if(firstClause.type !== "where" && firstClause.whereClauses.length === secondClause.whereClauses.length) {
                for(var i = 0; i < firstClause.whereClauses.length; i++) {
                    if(!service.areClausesEqual(firstClause.whereClauses[i], secondClause.whereClauses[i])) {
                        return false;
                    }
                }
                return true;
            }
        }
        return false;
    };

    /*
     * Returns whether the given filter has a single where clause.
     * @param {Object} filter The filter clause
     * @method hasSingleClause
     * @return {Boolean}
     */
    service.hasSingleClause = function(filter) {
        return filter.filter.whereClause.type === "where";
    };

    /*
     * Returns whether the given filter has a multiple where clauses.
     * @param {Object} filter The filter clause
     * @method hasMultipleClauses
     * @return {Boolean}
     */
    service.hasMultipleClauses = function(filter) {
        return filter.filter.whereClause.type === "and" || filter.filter.whereClause.type === "or";
    };

    /*
     * If the given filter has multiple clauses, it returns the number of clauses it has. Otherwise, returns 0.
     * @param {Object} filter The filter clause
     * @method getMultipleClausesLength
     * @return {Boolean}
     */
    service.getMultipleClausesLength = function(filter) {
        return (service.hasMultipleClauses(filter) ? filter.filter.whereClause.whereClauses.length : 0);
    };

    /*
     * Replaces the filter for the relations.
     * @param {Object} messenger The messenger object used to replace the filters
     * @param {Array} relations The array of relations containing a database name, a table name, and a map of fields
     * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
     *  <ul>
     *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
     *      <li> {String} or {Array} The field name(s) </li>
     *  </ul>
     * @param {String} or {Object} filterName The name of the visualization or an object containing {String} visName and {String} text
     * @param {Function} successFunction The function called once all the filters have been replaced (optional)
     * @param {Function} errorFunction The function called if an error is returned for any of the filter calls (optional)
     * @method replaceFilter
     * @private
     */
    var replaceFilter = function(messenger, relations, createFilterClauseFunction, filterName, successCallback, errorCallback) {
        var replaceNextFilter = function() {
            if(relations.length) {
                replaceFilter(messenger, relations, createFilterClauseFunction, filterName, successCallback, errorCallback);
            } else if(successCallback) {
                successCallback();
            }
        };

        var relation = relations.shift();
        var filter = createFilter(relation, createFilterClauseFunction, filterName);
        if(!filter) {
            replaceNextFilter();
            return;
        }

        var id = getRelationsFilterKeys([relation])[0];
        messenger.replaceFilter(id, filter, function() {
            var index = _.findIndex(service.filters, {
                id: id
            });
            service.filters[index] = {
                id: id,
                dataSet: {
                    databaseName: filter.databaseName,
                    tableName: filter.tableName
                },
                filter: filter
            };
            replaceNextFilter();
        }, errorCallback);
    };

    /**
     * Adds filters for the given relations.
     * @param {Object} messenger The messenger object used to add the filters
     * @param {Array} relations The array of relations containing a database name, a table name, and a map of fields
     * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
     *  <ul>
     *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
     *      <li> {String} or {Array} The field name(s) </li>
     *  </ul>
     * @param {String} or {Object} filterName The name of the visualization or an object containing {String} visName and {String} text
     * @param {Function} successCallback The function called once all the filters have been added (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @method addNewFilter
     * @private
     */
    var addNewFilter = function(messenger, relations, createFilterClauseFunction, filterName, successCallback, errorCallback) {
        var addNextFilter = function() {
            if(relations.length) {
                addNewFilter(messenger, relations, createFilterClauseFunction, filterName, successCallback, errorCallback);
            } else if(successCallback) {
                successCallback();
            }
        };

        var relation = relations.shift();
        var filter = createFilter(relation, createFilterClauseFunction, filterName);
        if(!filter) {
            addNextFilter();
            return;
        }

        var id = relation.database + "-" + relation.table + "-" + uuid();
        messenger.addFilter(id, filter, function() {
            service.filters.push({
                id: id,
                dataSet: {
                    databaseName: filter.databaseName,
                    tableName: filter.tableName
                },
                filter: filter
            });
            addNextFilter();
        }, errorCallback);
    };

    /**
     * Removes filters for all the given filter keys.
     * @param {Object} messenger The messenger object used to remove the filters
     * @param {Array} or {Object} filterKeys The array of filter keys or the map of database and table names to filter keys used by the messenger
     * @param {Function} successCallback The function called once all the filters have been removed (optional)
     * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
     * @method removeFilters
     * @private
     */
    var removeFilters = function(messenger, filterKeys, successCallback, errorCallback) {
        var filterKey = filterKeys.shift();
        messenger.removeFilter(filterKey, function() {
            var index = _.findIndex(service.filters, {
                id: filterKey
            });
            service.filters.splice(index, 1);
            if(filterKeys.length) {
                removeFilters(messenger, filterKeys, successCallback, errorCallback);
            } else if(successCallback) {
                successCallback();
            }
        }, errorCallback);
    };

    /**
     * Creates and returns a filter on the given table and field(s) using the given callback.
     * @param {Object} relation A relation object containing:
     * <ul>
     *      <li> {String} database The database name </li>
     *      <li> {Stirng} table The table name </li>
     *      <li> {Object} fields The map of field names to arrays of related field names </li>
     * </ul>
     * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
     *  <ul>
     *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
     *      <li> {String} or {Array} The field name(s) </li>
     *  </ul>
     * @param {String} or {Object} filterName The name of the visualization or an object containing {String} visName and {String} text
     * @method createFilter
     * @return {Object} A neon.query.Filter object or undefined if no filter clause could be created
     * @private
     */
    var createFilter = function(relation, createFilterClauseFunction, filterName) {
        // Creates a list of arguments for the filter clause creation function.  Each element is either a {String} or an {Array} depending on the number
        // of field keys in relation.fields.
        var argumentFieldsList = getArgumentFieldsList(relation);
        var relationDatabaseAndTableName = {
            database: relation.database,
            table: relation.table
        };

        var filterClause;
        if(argumentFieldsList.length === 1) {
            filterClause = createFilterClauseFunction(relationDatabaseAndTableName, argumentFieldsList[0]);
        } else {
            var filterClauses = [];
            for(var i = 0; i < argumentFieldsList.length; ++i) {
                var result = createFilterClauseFunction(relationDatabaseAndTableName, argumentFieldsList[i]);
                if(result) {
                    filterClauses.push(result);
                }
            }
            if(filterClauses.length) {
                filterClause = neon.query.or.apply(neon.query, filterClauses);
            }
        }

        if(filterClause) {
            var query = new neon.query.Filter().selectFrom(relation.database, relation.table).where(filterClause);
            if(filterName) {
                query = query.name(filterName);
            }
            return query;
        }

        return undefined;
    };

    /**
     * Returns the list of field names or arrays based on the data contained within the array of fields in the given relation to be used by a filter clause creation function.
     * @param {Object} relation A relation object containing a map of field names to arrays of related field names
     * @method getArgumentFieldsList
     * @return {Array} A list of {String} related field names if the map of field names in the given relation object only contains one field name key;
     * otherwise, a list of {Array} lists of {String} related field names representing each combination of the different field name keys.  Either way, the
     * elements of this list will be used to call the filter clause creation functions in filterService.createFilter() below.
     * @private
     */
    var getArgumentFieldsList = function(relation) {
        // The relation contains an object with the name of each initial field and the array of related fields for each initial field.
        // Keep the same order of the fields array.  This order may be used in the filter clause creation function.
        var fieldNames = relation.fields.map(function(field) {
            return field.initial;
        });

        // If only one field is used by the filter clause creation function, just return the list of related fields for that field.
        if(fieldNames.length === 1) {
            return relation.fields[0].related;
        }

        // Else we need to create a list of all combinations of the related fields.  First, create a list containing all the lists of related fields.
        var relationFieldsList = [];
        for(var i = 0; i < fieldNames.length; ++i) {
            relationFieldsList.push(relation.fields[i].related);
        }

        // Create a list of arguments representing the fields using all combinations of the related fields.
        var getArgumentFieldsListHelper = function(unfinishedArgumentFields, unusedRelationFields) {
            var argumentFieldsList = [];
            // Iterate over each element (list) in the first unused relation field.
            for(var i = 0; i < unusedRelationFields[0].length; ++i) {
                // Clone the unfinished arguments array and append the current unused relation field element.
                var fields = unfinishedArgumentFields.slice(0);
                fields.push(unusedRelationFields[0][i]);

                if(unusedRelationFields.length === 1) {
                    // If there are no more unused relation fields, we have finished creating this arguments array.
                    argumentFieldsList.push(fields);
                } else {
                    // Else, get the next element for the arguments array from the next unused relation field.
                    argumentFieldsList = argumentFieldsList.concat(getArgumentFieldsListHelper(fields, unusedRelationFields.slice(1)));
                }
            }
            return argumentFieldsList;
        };

        return getArgumentFieldsListHelper([], relationFieldsList);
    };

    /*
     * Returns a filter name based on the given name and relations.
     * @param {String} or {Object} name The name of the visualization or an object containing {String} visName and {String} text
     * @param {Object} relations
     * @method getFilterNameString
     * @return {String}
     * @private
     */
    var getFilterNameString = function(name, relations) {
        if(typeof name === 'object') {
            var string = "";
            if(name.visName) {
                string += name.visName + " - ";
            }
            var tableString;
            var table;
            if(relations.length > 0) {
                table = datasetService.getTableWithName(relations[0].database, relations[0].table);
                tableString = table.prettyName;
            }
            for(var i = 1; i < relations.length; i++) {
                table = datasetService.getTableWithName(relations[i].database, relations[i].table);
                tableString += ("/" + table.prettyName);
            }

            return string + tableString + (name.text ? ": " + name.text : "");
        } else {
            return name;
        }
    };

    /*
     * Returns a list of filter keys that belong to the given relations.
     * @param {Object} relations
     * @method getRelationsFilterKeys
     * @return {Array}
     * @private
     */
    var getRelationsFilterKeys = function(relations) {
        var keys = [];
        _.each(relations, function(relation) {
            var attrs = [];
            _.each(relation.fields, function(field) {
                attrs.push(field.related[0]);
            });
            keys = keys.concat(service.getFilters(relation.database, relation.table, attrs).map(function(filter) {
                return filter.id;
            }));
        });
        return keys;
    };

    return service;
}]);
