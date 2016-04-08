'use strict';
/*
 * Copyright 2016 Next Century Corporation
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

describe('Controller: opsClock', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));


    var $controller;

    beforeEach(inject(function(_$controller_) {
        // The injector unwraps the underscores (_) from around the parameter names when matching
        $controller = _$controller_;
    }));

    it('should initialize scope fields properly', function() {
        var $scope = {
            active: {},
            functions: {}
        };
        var controller = $controller('opsClockController', {$scope: $scope});
        expect($scope.active.dateField).toEqual({});
        expect($scope.active.maxDay).toBe('');
        expect($scope.active.maxTime).toBe('');
    });
});
