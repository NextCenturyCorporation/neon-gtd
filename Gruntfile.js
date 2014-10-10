'use strict';

module.exports = function(grunt) {

  grunt.initConfig({
    jshint: {
      all: [ 'Gruntfile.js', 'tasks/**/*.js', 'test/**/*_test.js', 'specs/**/*.js', 'e2e-tests/**/*.js' ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    bower: {
      install: {
        options: {
          layout: "byComponent",
          cleanTargetDir: true,
          cleanBowerDir: true,
          install: true,
          copy: true
        }
      },
      cleanup: {
        options: {
          layout: "byComponent",
          cleanTargetDir: true,
          cleanBowerDir: true,
          install: false,
          copy: false
        }
      }
    }


  });

  grunt.loadNpmTasks('grunt-bower-task');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('test', ['jshint']);
  grunt.registerTask('default', ['bower:install']);

};