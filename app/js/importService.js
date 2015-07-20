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

	service.getFieldsAndTypes = function(fieldTypePairs) { // Assumes it's given an array of objects with name and type fields, among others.
		var toReturn = [];
		fieldTypePairs.forEach(function(pair) {
			toReturn.push({
				name: pair.name,
				type: pair.type
			});
		});
		return toReturn;
	};

	service.getMaxSize = function(readable) {
		return readable ? service.sizeToReadable(MAX_SIZE) : MAX_SIZE;
	};

	service.sizeToReadable = function(size) {
	    var nameList = ["bytes", "kB", "mB", "gB", "tB", "pB"];
	    var name = 0;
	    while(size > 1000) {
	        size /= 1000;
	        name++;
	    }
	    return (Math.round(size * 10) / 10) + " " + nameList[name];
	};

	service.makeTextSafe = function(text) {
		return text.replace(/[ \t\n]/, "_");
	}

	return service;
});