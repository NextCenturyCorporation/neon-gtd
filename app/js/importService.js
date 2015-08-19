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

/**
 * This provides an Angular service for keeping track of various pieces of information relevant to importing custom data,
 * to easily pass them from place to place.
 *
 * @class neonDemo.services.ImportService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('ImportService', function() {
    var userName = '';
    var databaseName = '';
    var dateString = '';
    // The maximum file size allowed to be uploaded, in bytes.
    var MAX_SIZE = 30000000;

    var service = {};

    service.getUserName = function() {
        return userName;
    };

    service.setUserName = function(newName) {
        userName = newName;
    };

    service.getDatabaseName = function() {
        return databaseName;
    };

    service.setDatabaseName = function(newName) {
        databaseName = newName;
    };

    service.getDateString = function() {
        return dateString;
    };

    service.setDateString = function(newString) {
        dateString = newString;
    };

    /**
     * Gets the maximum allowable file input size, in either bytes or a human-readable string depending on
     * the value of the input parameter.
     * @param {boolean} Whether or not the output should be an integer number of bytes or in a human-readable string.
     * @return The maximum allowable file input size, either as a string if readable is true, or as an integer if
     * readable is false.
     */
    service.getMaxSize = function(readable) {
        return readable ? service.sizeToReadable(MAX_SIZE) : MAX_SIZE;
    };

    /**
     * Given an array of objects, assumed to each have a name field and a date field at the very least,
     * returns a new array of objects identical to the input array but with all fields except for name
     * and date removed.
     * @param fieldtypePairs {Array} The array of objects, each with at least a name and a type field.
     * @return {Array} An array identical to the input array, but with all fields except for name and
     * type removed.
     */
    service.getFieldsAndTypes = function(fieldTypePairs) {
        var toReturn = [];
        fieldTypePairs.forEach(function(pair) {
            toReturn.push({
                name: pair.name,
                type: pair.type
            });
        });
        return toReturn;
    };

    /**
     * Takes an integer and makes it more easily human-readable, assuming the number's units
     * are bytes. If the number is returned in anything other than bytes (if a number >= 1000
     * is given), this method returns up to one decimal point.
     * For instance, an input of 1023 would return 1 kB , while an input of 1058 would return 1.1 kB.
     * @param size {Integer} A number, assumed to be of bytes, to translate into human-reabable form.
     * @return {String} A human-readable version of the input number, with units attached.
     */
    service.sizeToReadable = function(size) {
        var nameList = ["bytes", "kB", "mB", "gB", "tB", "pB"];
        var name = 0;
        while(size > 1000) {
            size /= 1000;
            name++;
        }
        return (Math.round(size * 10) / 10) + " " + nameList[name];
    };

    return service;
});