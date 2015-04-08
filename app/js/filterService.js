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
         * Returns the array of field names contained within the map of fields in the given relation.
         * @param {Object} A relation object containing a map of fields
         * @method getFieldsFromRelation
         * @return {Array} The field names contained as values within the map of fields in the relation
         */
        service.getFieldsFromRelation = function(relation) {
            var fields = [];
            var keys = Object.keys(relation.fields);
            for(var i = 0; i < keys.length; ++i) {
                fields.push(relation.fields[keys[i]]);
            }
            return fields;
        };

        /**
         * Adds filters for the given relations using the given filter keys.
         * @param {Object} The messenger object used to add the filters
         * @param {Array} The array of relations containing a table name and a map of fields
         * @param {Object} The map of table names to filter keys used by the messenger
         * @param {Function} The function used to create filters with arguments for the table name and the array of field names in that table
         * @param {Function} The function called once all the filters have been added (optional)
         * @method addFilters
         */
        service.addFilters = function(messenger, relations, filterKeys, createFilterFunction, callback) {

            var addFilter = function(relationsToAdd) {
                var relation = relationsToAdd.shift();
                var filter = createFilterFunction(relation.table, service.getFieldsFromRelation(relation));
                messenger.addFilter(filterKeys[relation.table], filter, function() {
                    if(relationsToAdd.length) {
                        addFilter(relationsToAdd);
                    } else if(callback) {
                        callback();
                    }
                })
            };

            addFilter(relations);
        };

        /**
         * Replaces filters for the given relations using the given filter keys.
         * @param {Object} The messenger object used to replace the filters
         * @param {Array} The array of relations containing a table name and a map of fields
         * @param {Object} The map of table names to filter keys used by the messenger
         * @param {Function} The function used to create filters with arguments for the table name and the array of field names in that table
         * @param {Function} The function called once all the filters have been replaced (optional)
         * @method replaceFilters
         */
        service.replaceFilters = function(messenger, relations, filterKeys, createFilterFunction, callback) {

            var replaceFilter = function(relationsToReplace) {
                var relation = relationsToReplace.shift();
                var filter = createFilterFunction(relation.table, service.getFieldsFromRelation(relation));
                messenger.replaceFilter(filterKeys[relation.table], filter, function() {
                    if(relationsToReplace.length) {
                        replaceFilter(relationsToReplace);
                    } else if(callback) {
                        callback();
                    }
                })
            };

            replaceFilter(relations);
        };

        /**
         * Removes filters for all the given filter keys.
         * @param {Object} The messenger object used to remove the filters
         * @param {Object} The map of table names to filter keys used by the messenger
         * @param {Function} The function called once all the filters have been removed (optional)
         * @method removeFilters
         */
        service.removeFilters = function(messenger, filterKeys, callback) {
            var removeFilter = function(filterKeysToRemove) {
                var filterKey = filterKeysToRemove.shift();
                messenger.removeFilter(filterKey, function() {
                    if(filterKeysToRemove.length) {
                        removeFilter(filterKeysToRemove);
                    } else if(callback) {
                        callback();
                    }
                });
            };

            var tableNames = Object.keys(filterKeys);
            var filterKeysToRemove = [];
            for(var i = 0; i < tableNames.length; ++i) {
                filterKeysToRemove.push(filterKeys[tableNames[i]]);
            }

            removeFilter(filterKeysToRemove);
        };

        return service;
    }
);
