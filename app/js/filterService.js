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
.factory("FilterService",
    function() {
        var service = {};

        /**
         * Creates and returns a mapping of names from the given database and table names to unique filter keys for each database and table pair.
         * Uses the mapping of global filter keys (if given) for all possible database and table pairs.
         * @param {String} visualizationName The name of the visualization
         * @param {Object} databaseNamesToTableNames A map of database names to table names
         * @param {Object} globalFilterKeys (Optional) A map of database names to table names to filter keys
         * @method createFilterKeys
         * @return {Object} The mapping of database names to table names to filter keys
         */
        service.createFilterKeys = function(visualizationName, databaseNamesToTableNames, globalFilterKeys) {
            var filterKeys = {};
            var databaseNames = Object.keys(databaseNamesToTableNames);
            databaseNames.forEach(function(databaseName) {
                filterKeys[databaseName] = {};
                var tableNames = databaseNamesToTableNames[databaseName];
                tableNames.forEach(function(tableName) {
                    if(globalFilterKeys && globalFilterKeys[databaseName] && globalFilterKeys[databaseName][tableName]) {
                        filterKeys[databaseName][tableName] = globalFilterKeys[databaseName][tableName];
                    } else {
                        filterKeys[databaseName][tableName] = visualizationName + "-" + databaseName + "-" + tableName + "-" + uuid();
                    }
                });
            });
            return filterKeys;
        };

        /**
         * Returns the list of field names or arrays based on the data contained within the array of fields in the given relation to be used by a filter clause creation function.
         * @param {Object} relation A relation object containing a map of field names to arrays of related field names
         * @method getArgumentFieldsList
         * @return {Array} A list of {String} related field names if the map of field names in the given relation object only contains one field name key;
         * otherwise, a list of {Array} lists of {String} related field names representing each combination of the different field name keys.  Either way, the
         * elements of this list will be used to call the filter clause creation functions in filterService.createFilter() below.
         */
        service.getArgumentFieldsList = function(relation) {
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

        /**
         * Creates and returns a filter on the given table and field(s) using the given callback.
         * @param {Object} relation A relation object containing:
         * <ul>
         * <li> {String} database The database name </li>
         * <li> {Stirng} table The table name </li>
         * <li> {Object} fields The map of field names to arrays of related field names </li>
         * </ul>
         * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
         *  <ul>
         *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
         *      <li> {String} or {Array} The field name(s) </li>
         *  </ul>
         * @method createFilter
         * @return {Object} A neon.query.Filter object or undefined if no filter clause could be created
         */
        service.createFilter = function(relation, createFilterClauseFunction) {
            // Creates a list of arguments for the filter clause creation function.  Each element is either a {String} or an {Array} depending on the number
            // of field keys in relation.fields.
            var argumentFieldsList = service.getArgumentFieldsList(relation);
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
                return new neon.query.Filter().selectFrom(relation.database, relation.table).where(filterClause);
            }
            return undefined;
        };

        /**
         * Adds filters for the given relations using the given filter keys.
         * @param {Object} messenger The messenger object used to add the filters
         * @param {Array} relations The array of relations containing a database name, a table name, and a map of fields
         * @param {Object} filterKeys The map of database and table names to filter keys used by the messenger
         * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
         *  <ul>
         *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
         *      <li> {String} or {Array} The field name(s) </li>
         *  </ul>
         * @param {Function} successCallback The function called once all the filters have been added (optional)
         * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
         * @method addFilters
         */
        service.addFilters = function(messenger, relations, filterKeys, createFilterClauseFunction, successCallback, errorCallback) {
            var addFilter = function(relationsToAdd) {
                var addNextFilter = function() {
                    if(relationsToAdd.length) {
                        addFilter(relationsToAdd);
                    } else if(successCallback) {
                        successCallback();
                    }
                };

                var relation = relationsToAdd.shift();
                var filter = service.createFilter(relation, createFilterClauseFunction);
                if(!filter) {
                    addNextFilter();
                    return;
                }

                messenger.addFilter(filterKeys[relation.database][relation.table], filter, function() {
                    addNextFilter();
                }, errorCallback);
            };

            addFilter(relations);
        };

        /**
         * Replaces filters for the given relations using the given filter keys.
         * @param {Object} messenger The messenger object used to replace the filters
         * @param {Array} relations The array of relations containing a database name, a table name, and a map of fields
         * @param {Object} filterKeys The map of database and table names to filter keys used by the messenger
         * @param {Function} createFilterClauseFunction The function used to create the filter clause for each field, with arguments:
         *  <ul>
         *      <li> {Object} An object containing {String} database (the database name) and {String} table (the table name) </li>
         *      <li> {String} or {Array} The field name(s) </li>
         *  </ul>
         * @param {Function} successFunction The function called once all the filters have been replaced (optional)
         * @param {Function} errorFunction The function called if an error is returned for any of the filter calls (optional)
         * @method replaceFilters
         */
        service.replaceFilters = function(messenger, relations, filterKeys, createFilterClauseFunction, successCallback, errorCallback) {
            var replaceFilter = function(relationsToReplace) {
                var replaceNextFilter = function() {
                    if(relationsToReplace.length) {
                        replaceFilter(relationsToReplace);
                    } else if(successCallback) {
                        successCallback();
                    }
                };

                var relation = relationsToReplace.shift();
                var filter = service.createFilter(relation, createFilterClauseFunction);
                if(!filter) {
                    replaceNextFilter();
                    return;
                }

                messenger.replaceFilter(filterKeys[relation.database][relation.table], filter, function() {
                    replaceNextFilter();
                }, errorCallback);
            };

            replaceFilter(relations);
        };

        /**
         * Removes filters for all the given filter keys.
         * @param {Object} messenger The messenger object used to remove the filters
         * @param {Object} filterKeys The map of database and table names to filter keys used by the messenger
         * @param {Function} successCallback The function called once all the filters have been removed (optional)
         * @param {Function} errorCallback The function called if an error is returned for any of the filter calls (optional)
         * @method removeFilters
         */
        service.removeFilters = function(messenger, filterKeys, successCallback, errorCallback) {
            var removeFilter = function(filterKeysToRemove) {
                var filterKey = filterKeysToRemove.shift();
                messenger.removeFilter(filterKey, function() {
                    if(filterKeysToRemove.length) {
                        removeFilter(filterKeysToRemove);
                    } else if(successCallback) {
                        successCallback();
                    }
                }, errorCallback);
            };

            var filterKeysToRemove = [];
            var databaseNames = Object.keys(filterKeys);
            for(var i = 0; i < databaseNames.length; ++i) {
                var tableNames = Object.keys(filterKeys[databaseNames[i]]);
                for(var j = 0; j < tableNames.length; ++j) {
                    filterKeysToRemove.push(filterKeys[databaseNames[i]][tableNames[j]]);
                }
            }

            removeFilter(filterKeysToRemove);
        };

        return service;
    }
);
