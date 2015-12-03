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
.factory("AnnotationService", ["config", function(config) {
    var service = {
        URL: config.annotations.url,
        ID: config.annotations.properties ? config.annotations.properties.id : "",
        KEY: config.annotations.properties ? config.annotations.properties.key : "",
        VALUE: config.annotations.properties ? config.annotations.properties.value : "",
        USER: config.annotations.properties ? config.annotations.properties.user : "",
        annotations: {}
    };

    // Save the annotations from the configuration file if all other required properties exist.
    if(service.URL && service.ID && service.KEY && service.VALUE && config.annotations.mappings) {
        service.annotations = config.annotations.mappings;
    }

    /**
     * Returns the list of fields for annotations in the database and table with the given names.
     * @param {String} databaseName
     * @param {String} tableName
     * @method getAnnotationFields
     * @return {Array} The list of fields
     */
    service.getAnnotationFields = function(databaseName, tableName) {
        var fields = [];
        if(service.annotations[databaseName] && service.annotations[databaseName][tableName]) {
            Object.keys(service.annotations[databaseName][tableName]).forEach(function(fieldName) {
                fields.push(fieldName);
            });
        }
        return fields;
    };

    /**
     * Returns the list of fields and keys for annotations in the database and table with the given names.
     * @param {String} databaseName
     * @param {String} tableName
     * @method getAnnotationFields
     * @return {Array} The list of objects containing {String} key, {String} prefix, {String} suffix, and {String} field
     */
    service.getAnnotationFieldsAndKeys = function(databaseName, tableName) {
        var fieldsAndKeys = [];
        if(service.annotations[databaseName] && service.annotations[databaseName][tableName]) {
            Object.keys(service.annotations[databaseName][tableName]).forEach(function(fieldName) {
                var key = service.annotations[databaseName][tableName][fieldName];
                fieldsAndKeys.push({
                    key: _.isObject(key) ? key.annotation : key,
                    prefix: (_.isObject(key) ? key.prefix : undefined) || "",
                    suffix: (_.isObject(key) ? key.suffix : undefined) || "",
                    field: fieldName
                });
            });
        }
        return fieldsAndKeys;
    };

    return service;
}]);
